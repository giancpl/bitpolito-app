package it.bitpolito.hub

import android.content.Context
import dev.ipf.marmotkit.*
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import android.os.Handler
import android.os.Looper
import android.util.Base64
import kotlinx.coroutines.future.await

/**
 * Process-wide owner of MLS/SQLCipher. No HTTP sessions or application server.
 *
 * Threading: all engine work runs on [scope] (Dispatchers.IO) and is serialized by [gate].
 * Fields that are also touched from the UI thread or read outside [gate] are `@Volatile`.
 */
class HubRuntime private constructor(private val context: Context) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val gate = Mutex()
    private val main = Handler(Looper.getMainLooper())
    private val store = SecureStore(context)
    private var engine: Marmot? = null
    private var projection: HubProjection? = null
    @Volatile private var syncJob: Job? = null
    private var sequence = 0L
    @Volatile private var syncing = false
    @Volatile private var phase = "idle"
    private var lastInboxSummary = ""
    @Volatile private var lastError: String? = null

    /** Set by the WebView plugin; invoked from IO/FFI threads. */
    @Volatile var emit: ((String, JSONObject) -> Unit)? = null

    /** Written by the activity lifecycle (UI thread), read by sync and signer threads. */
    @Volatile var visible = false

    private val cryptoCalls = ConcurrentHashMap<String, CompletableFuture<String>>()
    private val device = store.get("hub.device") ?: UUID.randomUUID().toString().also { store.put("hub.device", it) }
    @Volatile private var account = store.get("hub.account")
    @Volatile private var team = account?.let { store.get("hub.team.$it") }
    @Volatile private var signedOut = store.get("hub.signedOut") == "true"
    private var identityName = account?.let { store.get("hub.name.$it") } ?: ""
    private val relays: List<String>
        get() = store.get("hub.relays.${account ?: "new"}")?.let { arrayStrings(JSONArray(it)) }
            ?: if (BuildConfig.SANDBOX) listOf("ws://127.0.0.1:3480", "ws://127.0.0.1:3481")
            else listOf("wss://relay.eu.whitenoise.chat", "wss://relay.us.whitenoise.chat")
    private val ownerPubkey: String? = NpubCodec.decodePubkey(BuildConfig.OWNER_NPUB)
    private val configuredAdmins: Set<String> = buildSet {
        ownerPubkey?.let { add(it) }
        addAll(NpubCodec.parseList(BuildConfig.ADMIN_NPUBS))
    }

    /** Registers a pending signer request and asks the unlocked WebView identity to answer it. */
    private fun requestCrypto(action: String, params: JSONObject): Pair<String, CompletableFuture<String>> {
        // Capture once: detach() may clear emit concurrently, and a request that is never
        // delivered would otherwise wait for the full timeout.
        val sink = emit
        check(visible && sink != null) { "Unlock your identity in the app to continue" }
        val id = UUID.randomUUID().toString()
        val result = CompletableFuture<String>()
        cryptoCalls[id] = result
        try {
            sink.invoke("bitpolito:crypto", params.put("id", id).put("action", action))
        } catch (e: Exception) {
            cryptoCalls.remove(id)
            throw e
        }
        return id to result
    }

    /**
     * Blocking variant for MarmotKit's [ExternalAccountSignerFfi] callbacks. uniffi callback
     * interfaces are synchronous (Rust waits on the calling thread for the return value), so
     * this cannot suspend. It runs on a Rust/JNA worker or IO thread; it must never run on the
     * main thread, because the WebView answer is delivered through the main looper.
     */
    private fun crypto(action: String, params: JSONObject): String {
        check(Looper.myLooper() != Looper.getMainLooper()) { "Identity operations cannot run on the main thread" }
        val (id, result) = requestCrypto(action, params)
        try {
            return result.get(CRYPTO_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        } finally {
            cryptoCalls.remove(id)
        }
    }

    /** Suspending variant for direct callers, so an IO thread is not parked while the user decides. */
    private suspend fun cryptoAwait(action: String, params: JSONObject): String {
        val (id, result) = requestCrypto(action, params)
        try {
            return withTimeoutOrNull(TimeUnit.SECONDS.toMillis(CRYPTO_TIMEOUT_SECONDS)) { result.await() }
                ?: throw TimeoutException()
        } finally {
            cryptoCalls.remove(id)
        }
    }

    fun reply(id: String, value: String?, error: String?) {
        cryptoCalls[id]?.let {
            if (error != null) it.completeExceptionally(IllegalStateException(error)) else it.complete(value ?: "")
        }
    }

    fun detach() {
        visible = false
        cryptoCalls.values.forEach { it.completeExceptionally(IllegalStateException("Identity operation interrupted")) }
        emit = null
    }

    @Synchronized fun pauseWhenHidden() {
        if (visible || HubOfficeService.running) return
        syncJob?.cancel()
        syncJob = null
        scope.launch {
            gate.withLock {
                if (!visible && !HubOfficeService.running) {
                    val previous = engine
                    engine = null
                    try {
                        previous?.shutdownAndClose()
                    } catch (_: Exception) {
                        lastError = "The relay connection paused. Reopen the app to reconnect."
                    }
                }
            }
        }
    }

    @Synchronized private fun stopSync() {
        syncJob?.cancel()
        syncJob = null
    }

    /** Called before an office command is queued: leaving the office silences alerts immediately. */
    fun beforeCommand(action: String?, input: JSONObject?) {
        if (action == "presence" && input?.optString("action") == "leave") HubOfficeService.stop(context)
    }

    /**
     * After presence/ring/request commands, start or stop the voluntary office listener so it
     * matches the new state. Only while the app is visible: the service manages itself otherwise.
     */
    suspend fun reconcileOfficeListener(action: String) {
        if (action !in listOf("presence", "ring", "request") || !visible) return
        val state = command("moo", JSONObject()) as JSONObject
        val mode = HubAlertPolicy.listener(state, store.get("hub.account")) { store.get("hub.alerts") == "true" }
        main.post {
            when (mode) {
                HubAlertPolicy.Listener.LISTEN -> HubOfficeService.start(context, false)
                HubAlertPolicy.Listener.FOLLOW_REQUEST -> HubOfficeService.start(context, true)
                HubAlertPolicy.Listener.STOP -> HubOfficeService.stop(context)
            }
        }
    }

    private fun signer(key: String) = object : ExternalAccountSignerFfi {
        override fun publicKey() = key

        override fun signEvent(unsignedEventJson: String): String {
            val event = JSONObject(unsignedEventJson)
            check(event.getInt("kind") !in listOf(0, 3)) { "Public profiles and contacts are disabled in BitPolito" }
            return crypto("sign", JSONObject().put("owner", key).put("event", event))
        }

        override fun nip04Encrypt(publicKey: String, content: String): String =
            throw IllegalStateException("Legacy encryption is not supported")

        override fun nip04Decrypt(publicKey: String, encryptedContent: String): String =
            throw IllegalStateException("Legacy encryption is not supported")

        override fun nip44Encrypt(publicKey: String, content: String) =
            crypto("encrypt", JSONObject().put("owner", key).put("pubkey", publicKey).put("content", content))

        override fun nip44Decrypt(publicKey: String, payload: String) =
            crypto("decrypt", JSONObject().put("owner", key).put("pubkey", publicKey).put("content", payload))
    }

    private suspend fun kit(bootstrap:List<String> = relays):Marmot {
        engine?.let{return it}
        val deployment=marmotDeploymentNeutral().apply{keychainService="${context.packageName}.marmot"}
        return Marmot.newWithConfiguration(File(context.noBackupFilesDir,"marmot-v1").absolutePath,bootstrap,MarmotOptions(relayPolicy=if(BuildConfig.SANDBOX)RelayPolicyFfi.ALLOW_LOOPBACK else RelayPolicyFfi.PUBLIC_ONLY,clientName="bitpolito",devicePlatform="Android",deployment=deployment)).also{engine=it;account?.let{key->it.registerExternalSigner(key,signer(key))};it.start()}
    }
    suspend fun login(key:String,name:String,invitation:String?=null):JSONObject=gate.withLock {
        require(key.matches(Regex("[a-f0-9]{64}"))){"Invalid Nostr identity"}
        // A cached MLS account is not proof that a newly connected signer owns this Nostr identity.
        val nonce=UUID.randomUUID().toString()
        val statement=JSONObject().put("challenge",nonce).put("device",device).put("pubkey",key).toString()
        val proof=JSONObject(cryptoAwait("sign",JSONObject().put("event",JSONObject().put("kind",30078).put("created_at",now()).put("tags",JSONArray().put(JSONArray().put("d").put("bitpolito.local-identity.v1"))).put("content",statement))))
        require(verifyPublicNostrEventJson(proof.toString())&&proof.getString("pubkey")==key&&proof.getInt("kind")==30078&&proof.getString("content")==statement&&kotlin.math.abs(proof.getLong("created_at")-now())<=60){"Your signer did not prove ownership of this identity"}
        // Signed invitation routes bootstrap a new phone even after the team moved away from defaults.
        val invitationRoutes=if(store.get("hub.team.$key")==null&&!invitation.isNullOrBlank())try{
            val descriptor=decodeInvite(invitation,true)
            if(descriptor.getLong("expiresAt")<=now())null else arrayStrings(descriptor.getJSONArray("relays")).also{NostrRoutingCodec.encode("0".repeat(64),it,BuildConfig.SANDBOX)}
        }catch(_:Exception){null}else null
        val bootstrap=invitationRoutes?:store.get("hub.relays.$key")?.let{arrayStrings(JSONArray(it))}?:relays
        val kit=kit(bootstrap)
        if(account!=null&&account!=key&&!signedOut){HubOfficeService.stop(context);kit.signOut(account!!,false)}
        kit.start()
        val alreadyConfigured=try{kit.onboardingSnapshot(key)?.ready==true}catch(_:MarmotKitException.UnknownAccount){false}
        if(alreadyConfigured&&!kit.onboardingRecoveryRequired(key)){
            // A previously configured local MLS device needs ownership proof, not a new identity setup.
            kit.registerExternalSigner(key,signer(key));kit.signInAccount(key)
        }else{
        var state=kit.beginExternalSignerOnboarding(key,signer(key),OnboardingOptionsFfi(bootstrap,bootstrap,bootstrap))
        // Do not publish kind 0 or kind 3. The MDK optional steps may be skipped.
        repeat(12) {
            if(!state.ready){
                state=kit.runOnboarding(key)
                for(step in state.steps)if(step.step in listOf(OnboardingStepFfi.PROFILE,OnboardingStepFfi.FOLLOWS)&&step.status !in listOf(OnboardingStatusFfi.PASSED,OnboardingStatusFfi.SKIPPED)){
                    if(step.actions.contains(OnboardingActionFfi.CONTINUE_WITHOUT))state=kit.continueOnboardingWithout(key,step.step)
                }
                val needsRelays=state.steps.find{it.step in listOf(OnboardingStepFfi.RELAYS,OnboardingStepFfi.INBOX_RELAYS)&&it.actions.contains(OnboardingActionFfi.USE_RECOMMENDED_RELAYS)}
                if(needsRelays!=null){state=kit.proposeOnboardingRecommendedRelays(key,needsRelays.step);val epoch=state.recoveryEpoch;state=if(epoch!=null)kit.approveOnboardingRepairInEpoch(key,state.revision,epoch)else kit.approveOnboardingRepair(key,state.revision)}
                val single=state.steps.find{it.step==OnboardingStepFfi.SINGLE_DEVICE&&it.status==OnboardingStatusFfi.NEEDS_INPUT}
                if(single!=null){val epoch=state.recoveryEpoch;state=if(epoch!=null)kit.acknowledgeOnboardingSingleDeviceInEpoch(key,state.revision,epoch)else kit.acknowledgeOnboardingSingleDevice(key,state.revision)}
            }
        }
        check(state.ready){"Identity setup needs attention. Check your relays and signer, then try again."}
        }
        try { kit.catchUpAccounts() } catch (_: Exception) {}
        if(account!=key){projection=null;team=store.get("hub.team.$key")};account=key;signedOut=false
        identityName=if(name.isNotBlank())name.trim().take(60)else store.get("hub.name.$key")?:"Teammate"
        if(invitationRoutes!=null)store.put("hub.relays.$key",JSONArray(invitationRoutes).toString())
        store.put("hub.account",key);store.put("hub.name.${activeAccount()}",identityName);store.put("hub.signedOut","false")
        startSync()
        JSONObject().put("ok",true)
    }
    private fun activeAccount():String {check(!signedOut){"Sign in with your Nostr identity"};return account?:error("Sign in with your Nostr identity")}
    private suspend fun load():HubProjection {
        val group=team?:error("Member access required")
        val p=projection?:HubProjection(group).also{it.restore(store.get("hub.log.${activeAccount()}.$group"));projection=it}
        val roster=kit().groupRoster(activeAccount(),group)
        check(roster.selfMembership==SelfMembershipFfi.MEMBER){"Member access required. Your group membership is no longer active."}
        p.members.clear();roster.members.forEach{m->p.members[key(m.memberIdHex)]=m.isAdmin}
        val messages=kit().messages(activeAccount(),group,10000u,listOf(78uL))
        var changed=false
        for(m in messages)if(m.plaintext.startsWith("{")) {
            val author=key(m.sender)
            if(m.invalidated){try{changed=p.invalidate(JSONObject(m.plaintext).getString("id"),author)||changed}catch(_:Exception){};continue}
            try{changed=p.ingest(m.plaintext,author,p.members[author]==true)||changed}catch(_:Exception){}
        }
        if(changed)store.put("hub.log.${activeAccount()}.$group",p.export())
        val announcementKey = "hub.announced.v2.${activeAccount()}.$group"
        val revision = roster.rosterRevision.toString()
        if (store.get(announcementKey) != revision) {
            val announcements = listOfNotNull(
                p.profileAnnouncement(activeAccount()),
                p.presenceAnnouncement(activeAccount()),
            )
            val allPublished = announcements.all { announcement ->
                kit().sendCustomEvent(
                    activeAccount(),
                    group,
                    78uL,
                    listOf(listOf("t", "bitpolito.hub.v1")),
                    announcement.toString(),
                ).published > 0u
            }
            if (allPublished) store.put(announcementKey, revision)
        }
        return p
    }
    private fun key(value:String):String {
        if(value.matches(Regex("[a-f0-9]{64}")))return value
        return Regex("[a-f0-9]{64}").find(value)?.value?:value
    }
    private fun now()=System.currentTimeMillis()/1000
    private suspend fun publish(type:String,data:JSONObject,id:String=UUID.randomUUID().toString()):JSONObject {
        val p=load();val author=activeAccount();val group=team!!
        val pending=JSONArray(store.get("hub.outbox.${activeAccount()}.$group")?:"[]")
        for(i in 0 until pending.length())if(pending.getJSONObject(i).getString("id")==id){val previous=pending.getJSONObject(i);flush(p);return previous}
        // Stable operation IDs remain stable after acknowledgement and a process restart.
        p.operation(id,author)?.let{return it}
        sequence=maxOf(sequence,store.get("hub.sequence")?.toLongOrNull()?:0)+1
        store.put("hub.sequence",sequence.toString())
        val op=JSONObject().put("version",1).put("id",id).put("team",group).put("device",device).put("sequence",sequence).put("revision",maxOf(p.maxRevision(),(0 until pending.length()).maxOfOrNull{pending.getJSONObject(it).getLong("revision")}?:0)+1).put("createdAt",now()).put("type",type).put("data",data)
        val queue=JSONArray(store.get("hub.outbox.${activeAccount()}.$group")?:"[]");queue.put(op);store.put("hub.outbox.${activeAccount()}.$group",queue.toString())
        val localIntent=(type=="presence"&&data.optString("action")=="leave")||type in listOf("inside","cancel")
        if(localIntent) {p.ingest(op.toString(),author,p.members[author]==true);store.put("hub.log.${activeAccount()}.$group",p.export())}
        try{flush(p)}catch(e:Exception){if(!localIntent)throw e;lastError=errorMessage(e)}
        return op
    }
    private suspend fun flush(p:HubProjection) {
        val group=team?:return;val queue=JSONArray(store.get("hub.outbox.${activeAccount()}.$group")?:"[]");val kept=JSONArray()
        for(i in 0 until queue.length()) {
            val op=queue.getJSONObject(i)
            val lifetime=when(op.getString("type")){"ring"->180;"offer"->90;else->null}
            if(lifetime!=null&&op.getLong("createdAt")+lifetime<=now())continue
            try {
                val sent=kit().sendCustomEvent(activeAccount(),group,78uL,listOf(listOf("t","bitpolito.hub.v1")),op.toString())
                check(sent.published>0u){"No relay accepted this update. It will retry while it is still useful."}
                p.ingest(op.toString(),activeAccount(),p.members[activeAccount()]==true)
            }catch(e:Exception){kept.put(op);lastError=errorMessage(e)}
        }
        store.put("hub.outbox.${activeAccount()}.$group",kept.toString());store.put("hub.log.${activeAccount()}.$group",p.export())
        if(kept.length()>0)throw IllegalStateException(lastError?:"Update pending. Reconnect and try again.")
    }
    /** Public technical discovery only: never publishes kind 0 or contacts. */
    private suspend fun ensureDiscoveryRoutes(routes:List<String>) {
        val account=activeAccount();val kit=kit()
        val bootstrap=(relays+routes).distinct()
        val outbox=(kit.accountNip65Relays(account)+routes).distinct()
        val inbox=(kit.accountInboxRelays(account)+routes).distinct()
        require(outbox.size<=16&&inbox.size<=16){"Too many identity relay routes. Review them before migrating."}
        kit.setAccountNip65Relays(account,outbox,bootstrap)
        kit.setAccountInboxRelays(account,inbox,bootstrap)
        check(kit.republishKeyPackage(account)>0uL){"Identity discovery is pending publication. Keep the app open and try again."}
    }
    private fun records(name:String)=JSONArray(store.get("hub.$name.${activeAccount()}")?:"[]")
    private fun saveRecords(name:String,rows:JSONArray)=store.put("hub.$name.${activeAccount()}",rows.toString())
    /** Reading is harmless; retiring a foreign slot always requires separate explicit consent. */
    private suspend fun otherPhonePackages(routes:List<String>):List<AccountKeyPackageFfi> {
        val retired=arrayStrings(records("retiredPackages")).toSet()
        return kit().refreshAccountKeyPackages(activeAccount(),routes)
            .filter{it.localState==AccountKeyPackageLocalStateFfi.NOT_LOCAL&&it.record.relay&&it.record.eventIdHex !in retired}
            .map{it.record}.distinctBy{it.eventIdHex}
    }
    private fun decodeInvite(value:String,allowExpired:Boolean=false):JSONObject {
        require(value.length<=16384){"The invitation is too large"}
        val token=if(value.contains("invite="))value.substringAfter("invite=").substringBefore('&')else value
        val proof=JSONObject(String(Base64.decode(token,Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),Charsets.UTF_8))
        require(verifyPublicNostrEventJson(proof.toString())){"This invitation has an invalid signature"}
        require(proof.getInt("kind")==30078){"Unsupported invitation"}
        val invite=JSONObject(proof.getString("content"))
        require(invite.getInt("version")==1&&invite.getString("issuer")==proof.getString("pubkey")){"Invalid invitation"}
        require(allowExpired||invite.getLong("expiresAt")>now()){"Invitation expired"}
        return invite.put("proof",proof)
    }
    private suspend fun admissions() {
        if(!visible)return // Welcomes may need the account signer. Never prompt from the service.
        val who=activeAccount();val kit=kit();val pending=store.get("hub.pendingJoin.$who")?.let{JSONObject(it)}
        phase="reading invitations"
        val chats=kit.chatList(who,true).take(100)
        val summary="${chats.size}:${chats.count{it.pendingConfirmation}}"
        if(BuildConfig.DEBUG&&summary!=lastInboxSummary){android.util.Log.d("BitPolitoHub","Admission inbox groups: $summary");lastInboxSummary=summary}
        if(pending!=null&&(team==null||team==pending.getJSONObject("invite").getString("team"))) {
            val expected=pending.getJSONObject("invite")
            val row=chats.find{it.groupIdHex==expected.getString("team")}
            if(row!=null){
                val details=kit.groupDetails(who,row.groupIdHex)
                if(details.group.admins.any{key(it)==expected.getString("issuer")}&&details.group.description=="bitpolito.hub.v1"){
                    if(row.pendingConfirmation)kit.acceptGroupInvite(who,row.groupIdHex)
                    team=row.groupIdHex;store.put("hub.team.${activeAccount()}",team);projection=null
                    if(identityName.isNotBlank())publish("profile",JSONObject().put("name",identityName).put("about",""),"admission-${expected.getString("id")}")
                    store.put("hub.pendingJoin.$who",null)
                }
            }
            if(team==null)for(m in kit.messages(who,pending.getString("control"),100u,listOf(78uL)))try{
                val reply=JSONObject(m.plaintext)
                if(key(m.sender)==expected.getString("issuer")&&reply.optString("type") in listOf("join-declined","join-invalid")){
                    pending.put("status",if(reply.getString("type")=="join-declined")"declined" else reply.optString("status","used"));store.put("hub.pendingJoin.$who",pending.toString())
                }
            }catch(_:Exception){}
        }
        if(team==null)return
        val p=load();if(p.members[who]!=true)return
        val invitations=records("invites");val requests=records("applications")
        val rejected=JSONObject(store.get("hub.rejectedInbox.$who")?:"{}")
        val known=(0 until requests.length()).map{requests.getJSONObject(it).getString("id")}.toMutableSet()
        for(row in chats.filter{it.groupIdHex!=team}.take(20)) {
            val details=kit.groupDetails(who,row.groupIdHex)
            if(BuildConfig.DEBUG)android.util.Log.d("BitPolitoHub","Admission candidate: control=${details.group.description=="bitpolito.join.v1"}, members=${details.members.size}, pending=${row.pendingConfirmation}")
            if(details.group.description!="bitpolito.join.v1"||details.members.size!=2)continue
            if(row.pendingConfirmation)kit.acceptGroupInvite(who,row.groupIdHex)
            for(m in kit.messages(who,row.groupIdHex,100u,listOf(78uL)))try{
                if(m.invalidated||rejected.has(m.messageIdHex))continue
                val request=JSONObject(m.plaintext);if(request.optString("type")!="join-request")continue
                val descriptor=decodeInvite(request.getString("token"),true);if(descriptor.getString("issuer")!=who||descriptor.getString("team")!=team)continue
                val issuerRecord=(0 until invitations.length()).map{invitations.getJSONObject(it)}.find{it.getString("id")==descriptor.getString("id")}?:continue
                if(issuerRecord.getString("secret")!=descriptor.getString("secret"))continue
                val sender=key(m.sender);if(sender==who||!sender.matches(Regex("[a-f0-9]{64}")))continue
                if((0 until requests.length()).any{val old=requests.getJSONObject(it);old.optString("invite")==descriptor.getString("id")&&old.optString("pubkey")==sender&&old.optString("control")==row.groupIdHex})continue
                val refusal=if(!issuerRecord.isNull("usedAt"))"used" else if(!issuerRecord.isNull("revokedAt"))"revoked" else if(issuerRecord.getLong("expiresAt")<=now())"expired" else null
                if(refusal!=null){val receipt=kit.sendCustomEvent(who,row.groupIdHex,78uL,emptyList(),JSONObject().put("type","join-invalid").put("status",refusal).toString());if(receipt.published>0u){rejected.put(m.messageIdHex,now());store.put("hub.rejectedInbox.$who",rejected.toString())};continue}
                val applicationId=UUID.nameUUIDFromBytes((descriptor.getString("id")+":"+sender).toByteArray()).toString()
                if(requests.let{rows->(0 until rows.length()).any{val old=rows.getJSONObject(it);old.optString("invite")==descriptor.getString("id")&&old.optString("pubkey")==sender}}||!known.add(applicationId))continue
                requests.put(JSONObject().put("id",applicationId).put("invite",descriptor.getString("id")).put("pubkey",sender).put("name",request.optString("name").take(60)).put("control",row.groupIdHex).put("status","pending").put("createdAt",now()))
            }catch(e:Exception){if(BuildConfig.DEBUG)android.util.Log.d("BitPolitoHub","Admission ignored: ${e.javaClass.simpleName}")}
        }
        saveRecords("applications",requests)
    }
    @Synchronized fun startSync() {
        if (syncJob?.isActive == true || signedOut || account == null) return
        syncJob = scope.launch {
            var wasConnected = false
            var ticks = 0
            while (isActive) {
                try {
                    gate.withLock {
                        syncing = true
                        kit()
                        // Expiry is local and must stop office listening even with both relays offline.
                        projection?.let { HubOfficeService.update(context, it.state(activeAccount()), false) }
                        val connected = kit().accountRelayLiveness(activeAccount()).any { it.status == RelayStatusFfi.CONNECTED }
                        if (!connected) {
                            lastError = "No relay connection. Updates will retry when connectivity returns."
                        } else {
                            if (!wasConnected || ticks % 4 == 0) {
                                try { kit().catchUpAccounts() } catch (_: Exception) {}
                            }
                            if (visible) admissions()
                            if (team != null) {
                                val p = load()
                                try {
                                    flush(p)
                                    lastError = null
                                } catch (e: Exception) {
                                    lastError = errorMessage(e)
                                }
                                HubOfficeService.update(context, p.state(activeAccount()))
                            } else {
                                lastError = null
                            }
                        }
                        wasConnected = connected
                        ticks++
                        emit?.invoke("bitpolito:realtime", JSONObject())
                    }
                } catch (e: CancellationException) {
                    // pauseWhenHidden()/logout cancelled the loop: not a sync failure to surface.
                    throw e
                } catch (e: Exception) {
                    lastError = errorMessage(e)
                    if (e is MarmotKitException.GroupRemoved || e is MarmotKitException.UnknownGroup ||
                        e.message?.contains("Member access required") == true
                    ) {
                        HubOfficeService.stop(context)
                    }
                } finally {
                    syncing = false
                }
                delay(2500)
            }
        }
    }

    suspend fun command(action:String,input:JSONObject):Any {
        // Connection status must remain readable while an interactive signer/network call is pending.
        if(action=="status")return JSONObject().put("state",if(lastError!=null)"reconnecting" else if(syncing)"syncing" else "connected").put("error",lastError?:JSONObject.NULL).put("activity",phase)
        return gate.withLock { when(action){
            "configuration"->JSONObject().put("transport","marmot").put("sandbox",BuildConfig.SANDBOX).put("relays",JSONArray(relays)).put("signerRelays",JSONArray(listOf("wss://nrs.primal.net"))).put("timezone","Europe/Rome").put("pushPublicKey",JSONObject.NULL).put("ownerPubkey",ownerPubkey?:JSONObject.NULL).put("adminPubkeys",JSONArray(configuredAdmins.toList()))
            "status"->JSONObject().put("state",if(lastError!=null)"reconnecting" else if(syncing)"syncing" else "connected").put("error",lastError?:JSONObject.NULL)
            "alertSettings"->{store.put("hub.vibration",input.optBoolean("vibration").toString());JSONObject().put("ok",true)}
            "me"->{if(account==null||signedOut)JSONObject().put("user",JSONObject.NULL)else{
                val fallback=JSONObject().put("id",activeAccount()).put("name",identityName).put("about","").put("role","follower")
                val user=if(team==null)fallback else try{val p=load();p.users().let{list->(0 until list.length()).map{list.getJSONObject(it)}.find{it.getString("id")==activeAccount()}}}catch(e:Exception){lastError=errorMessage(e);if((e is MarmotKitException.GroupRemoved||e is MarmotKitException.UnknownGroup||e.message?.contains("Member access required")==true)){store.put("hub.team.${activeAccount()}",null);team=null;projection=null};fallback}
                JSONObject().put("user",user?:JSONObject.NULL)
            }}
            "createTeam"->{check(team==null){"This device already belongs to a team"};if(configuredAdmins.isNotEmpty())check(activeAccount() in configuredAdmins){"Only the configured BitPolito owner or administrator can create the official team"};val created=kit().createGroup(activeAccount(),"BitPolito",emptyList(),"bitpolito.hub.v1");team=requireNotNull(created.groupIdHex){"No relay accepted the new team"};store.put("hub.team.${activeAccount()}",team);projection=null;publish("profile",JSONObject().put("name",identityName).put("about",""));startSync();JSONObject().put("ok",true)}
            "profile"->{identityName=input.getString("name").trim().take(60);require(identityName.isNotEmpty()){ "Enter your name" };store.put("hub.name.${activeAccount()}",identityName);if(team!=null)publish("profile",JSONObject().put("name",identityName).put("about",input.optString("about").take(500)));JSONObject().put("ok",true)}
            "deviceReadiness"->{activeAccount();check(team==null){"This phone already belongs to a team"};val routes=arrayStrings(decodeInvite(input.getString("token")).getJSONArray("relays"));JSONObject().put("otherInstallations",otherPhonePackages(routes).map{it.keyPackageId}.distinct().size)}
            "preparePhone"->{
                activeAccount();check(team==null&&input.optBoolean("confirmed")){"Confirm the previous installation retirement first"}
                val routes=arrayStrings(decodeInvite(input.getString("token")).getJSONArray("relays"))
                val retired=records("retiredPackages")
                for(row in otherPhonePackages(routes)){
                    check(kit().deleteAccountKeyPackage(activeAccount(),row.eventIdHex,(routes+row.sourceRelays).distinct()).toLong()>0){"No relay accepted the previous installation retirement. Try again."}
                    retired.put(row.eventIdHex);saveRecords("retiredPackages",retired)
                }
                JSONObject().put("ok",true)
            }
            "moo"->load().state(activeAccount())
            "presence"->{val actionName=input.getString("action");require(actionName in listOf("arrive","leave")){"Presence extensions are no longer supported"};val p=load();if(actionName=="arrive"){val own=p.state(activeAccount()).optJSONObject("own");check(own==null||own.getString("status") !in listOf("waiting","claimed")){"Finish or cancel your door request before checking in"}}else HubOfficeService.stop(context);publish("presence",JSONObject().put("action",actionName));load().state(activeAccount())}
            "ring"->{val p=load();val previous=p.request(input.getString("key"));if(previous!=null){check(previous.getString("requesterId")==activeAccount()){"This request identifier is already in use"};return@withLock previous};val state=p.state(activeAccount());val own=state.optJSONObject("own");check(!p.isInside(activeAccount())){"You are marked in the office. Choose I’m leaving first."};check(state.getJSONArray("presence").length()>0){"Nobody is marked as in the office"};if(own!=null&&own.getString("status") in listOf("waiting","claimed"))own else {check(own==null||own.getLong("createdAt")+60<=now()){ "Wait 60 seconds before ringing again" };val id=input.getString("key");publish("ring",JSONObject(),id);load().request(id)?:error("Request is pending publication")}}
            "request"->{val p=load();val id=input.getString("id");val r=p.request(id)?:error("Request not found");val who=activeAccount();val op=when(input.getString("action")){"claim"->"offer";"release"->"release";"inside"->"inside";"cancel"->"cancel";else->error("This action is no longer supported")};
                if(op in listOf("inside","cancel"))check(r.getString("requesterId")==who){"Only the requester can do this"}
                if(r.getString("status") in listOf("resolved","cancelled")){if(op=="inside"&&r.getString("status")=="resolved")return@withLock r;error("This request has ended")};check(r.getLong("expiresAt")>now()){"This request has expired"};if(op in listOf("inside","cancel"))check(r.getString("requesterId")==who){"Only the requester can do this"}else check(p.isInside(who)&&r.getString("requesterId")!=who){"Only office members can respond"};publish(op,JSONObject().put("request",id));load().request(id)!!}
            "resources"->load().resources()
            "relays"->{load();JSONObject().put("relays",JSONArray(kit().groupDetails(activeAccount(),team!!).group.relays))}
            "setRelays"->{val p=load();check(p.members[activeAccount()]==true){"Administrator access required"};val current=kit().groupDetails(activeAccount(),team!!).group;val next=arrayStrings(input.getJSONArray("relays"));check(current.relays.any{it in next}){"Add the new relays before removing all previous endpoints"};val encoded=NostrRoutingCodec.encode(current.nostrGroupIdHex,next,BuildConfig.SANDBOX);ensureDiscoveryRoutes(next);val sent=kit().updateAppComponent(activeAccount(),team!!,NostrRoutingCodec.COMPONENT.toUShort(),encoded);check(sent.published>0u){"Relay migration is pending publication"};store.put("hub.relays.${activeAccount()}",JSONArray(next).toString());JSONObject().put("ok",true)}
            "saveResource"->{val p=load();check(p.members[activeAccount()]==true){"Administrator access required"};val row=JSONObject(input.toString());row.put("id",input.optString("id").ifBlank{UUID.randomUUID().toString()});row.put("icon",input.optString("icon","icon-linkedin.svg"));HubProjection.validateResource(row);publish("resource",row);row}
            "members"->load().users()
            "invites"->{check(load().members[activeAccount()]==true){"Administrator access required"};val rows=records("invites");JSONArray((0 until rows.length()).map{JSONObject(rows.getJSONObject(it).toString()).apply{remove("secret")}})}
            "createInvite"->{check(load().members[activeAccount()]==true){"Administrator access required"};val id=UUID.randomUUID().toString();val secret=UUID.randomUUID().toString()+UUID.randomUUID().toString();val expires=now()+7*86400
                val descriptor=JSONObject().put("version",1).put("id",id).put("issuer",activeAccount()).put("team",team).put("expiresAt",expires).put("secret",secret).put("relays",JSONArray(kit().groupDetails(activeAccount(),team!!).group.relays))
                val proof=cryptoAwait("sign",JSONObject().put("event",JSONObject().put("kind",30078).put("created_at",now()).put("tags",JSONArray().put(JSONArray().put("d").put("bitpolito.invite.$id"))).put("content",descriptor.toString())))
                require(verifyPublicNostrEventJson(proof)&&JSONObject(proof).getString("pubkey")==activeAccount()){"Invalid invitation signature"}
                val rows=records("invites");rows.put(JSONObject().put("id",id).put("label",input.getString("label").take(80)).put("expiresAt",expires).put("secret",secret).put("usedAt",JSONObject.NULL).put("revokedAt",JSONObject.NULL));saveRecords("invites",rows)
                JSONObject().put("token",Base64.encodeToString(proof.toByteArray(),Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING))}
            "revokeInvite"->{check(load().members[activeAccount()]==true){"Administrator access required"};val rows=records("invites");for(i in 0 until rows.length())if(rows.getJSONObject(i).getString("id")==input.getString("id"))rows.getJSONObject(i).put("revokedAt",now());saveRecords("invites",rows);JSONObject().put("ok",true)}
            "join"->{
                check(team==null){"This device already belongs to a team"}
                val descriptor=decodeInvite(input.getString("token"))
                var pending=store.get("hub.pendingJoin.${activeAccount()}")?.let{JSONObject(it)}
                if(pending==null||pending.getJSONObject("invite").getString("id")!=descriptor.getString("id")){
                    val routes=arrayStrings(descriptor.getJSONArray("relays"));NostrRoutingCodec.encode("0".repeat(64),routes,BuildConfig.SANDBOX)
                    check(otherPhonePackages(routes).isEmpty()){"Another Marmot installation is advertised for this identity. Review the phone replacement notice before requesting access."}
                    ensureDiscoveryRoutes(routes);kit().refreshUserRelayLists(descriptor.getString("issuer"),routes)
                    val control=kit().createGroup(activeAccount(),"BitPolito admission",listOf(descriptor.getString("issuer")),"bitpolito.join.v1").groupIdHex?:error("Could not reach the administrator. Check your relays and try again.")
                    pending=JSONObject().put("invite",descriptor).put("control",control).put("status","publishing")
                    store.put("hub.pendingJoin.${activeAccount()}",pending.toString())
                }
                if(pending.optString("status")=="publishing"){
                    val sent=kit().sendCustomEvent(activeAccount(),pending.getString("control"),78uL,listOf(listOf("t","bitpolito.join.v1")),JSONObject().put("type","join-request").put("token",input.getString("token").substringAfter("invite=")).put("name",identityName).toString())
                    check(sent.published>0u){"No relay accepted your application. Try again."}
                    pending.put("status","pending");store.put("hub.pendingJoin.${activeAccount()}",pending.toString())
                }
                startSync();JSONObject().put("status",pending.getString("status"))
            }
            "joinStatus"->(store.get("hub.pendingJoin.${activeAccount()}")?.let{val pending=JSONObject(it);if(pending.getJSONObject("invite").getLong("expiresAt")<=now())pending.put("status","expired");pending.put("invite",JSONObject.NULL)}?:JSONObject().put("status","none"))
            "applications"->{check(load().members[activeAccount()]==true){"Administrator access required"};records("applications")}
            "reviewApplication"->{
                val p=load();check(p.members[activeAccount()]==true){"Administrator access required"}
                val rows=records("applications");val request=(0 until rows.length()).map{rows.getJSONObject(it)}.find{it.getString("id")==input.getString("id")}?:error("Application not found")
                if(request.getString("status") !in listOf("approved","declined")){
                    if(input.getString("decision")=="approve"){
                        val invitations=records("invites");val invite=(0 until invitations.length()).map{invitations.getJSONObject(it)}.find{it.getString("id")==request.getString("invite")}?:error("Invitation not found")
                        check(invite.isNull("revokedAt")&&invite.getLong("expiresAt")>now()){"Invitation expired or revoked"}
                        check(invite.isNull("usedAt")||invite.optString("usedApplication")==request.getString("id")){"Invitation already used"}
                        val who=request.getString("pubkey")
                        if(request.optString("phase").isBlank()){
                            val replacement=p.members.containsKey(who)
                            if(replacement){
                                check(input.optBoolean("replace")){"This identity already has a phone. Confirm replacement before approving."}
                                check(!(p.members[who]==true&&p.members.values.count{it}==1)){"Promote another administrator before replacing the last administrator’s phone"}
                            }
                            request.put("phase",if(replacement)"removing" else "adding").put("restoreAdmin",p.members[who]==true)
                            saveRecords("applications",rows)
                        }
                        if(request.optString("phase")=="removing"){
                            if(kit().groupRoster(activeAccount(),team!!).members.any{key(it.memberIdHex)==who})kit().removeMembers(activeAccount(),team!!,listOf(who))
                            check(kit().groupRoster(activeAccount(),team!!).members.none{key(it.memberIdHex)==who}){"Previous phone removal is still synchronizing. Try again."}
                            request.put("phase","adding");saveRecords("applications",rows)
                        }
                        // Clear prior device presence/requests before admitting this identity again.
                        publish("member-reset",JSONObject().put("member",who),"reset-${request.getString("id")}")
                        if(kit().groupRoster(activeAccount(),team!!).members.none{key(it.memberIdHex)==who})kit().inviteMembers(activeAccount(),team!!,listOf(who))
                        check(kit().groupRoster(activeAccount(),team!!).members.any{key(it.memberIdHex)==who}){"Membership publication is pending. Try again."}
                        if(kit().groupRoster(activeAccount(),team!!).members.first{key(it.memberIdHex)==who}.deviceCount!=1u){
                            kit().removeMembers(activeAccount(),team!!,listOf(who))
                            error("More than one phone is still advertised. Ask the member to sign out on the previous phone and prepare this phone again before retrying approval.")
                        }
                        if((request.optBoolean("restoreAdmin")||who in configuredAdmins)&&kit().groupRoster(activeAccount(),team!!).members.none{key(it.memberIdHex)==who&&it.isAdmin})kit().promoteAdmin(activeAccount(),team!!,who)
                        invite.put("usedAt",now()).put("usedApplication",request.getString("id"));saveRecords("invites",invitations)
                        val snapshotProfiles = p.profiles().toMutableMap()
                        val applicantName = request.optString("name").trim().take(60)
                        if (applicantName.isNotEmpty() && !snapshotProfiles.containsKey(who)) {
                            snapshotProfiles[who] = JSONObject().put("id", who).put("name", applicantName).put("about", "")
                        }
                        publish("snapshot", JSONObject().put("profiles", JSONArray(snapshotProfiles.values.toList())).put("resources", p.resources()), "snapshot-${request.getString("id")}")
                        request.put("status","approved");saveRecords("applications",rows)
                    }else{
                        check(request.optString("phase").isBlank()){"Approval is already in progress. Finish it before changing this request."}
                        val sent=kit().sendCustomEvent(activeAccount(),request.getString("control"),78uL,emptyList(),JSONObject().put("type","join-declined").toString())
                        check(sent.published>0u){"The decision is pending publication. Try again."}
                        request.put("status","declined");saveRecords("applications",rows)
                    }
                }
                JSONObject().put("ok",true)
            }
            "setRole"->{val p=load();check(p.members[activeAccount()]==true){"Administrator access required"};val id=input.getString("id");val role=input.getString("role");if(ownerPubkey!=null&&id==ownerPubkey&&role!="admin")error("The team owner cannot be demoted or removed");if(role=="follower"&&!p.members.containsKey(id))return@withLock JSONObject().put("ok",true);check(p.members.containsKey(id)){"Member not found"};if((role=="admin"&&p.members[id]==true)||(role=="member"&&p.members[id]==false))return@withLock JSONObject().put("ok",true);check(!(p.members[id]==true&&role!="admin"&&p.members.values.count{it}==1)){"The last administrator cannot be removed"};when(role){"admin"->kit().promoteAdmin(activeAccount(),team!!,id);"member"->if(id==activeAccount())kit().selfDemoteAdmin(activeAccount(),team!!)else kit().demoteAdmin(activeAccount(),team!!,id);"follower"->if(id==activeAccount())kit().leaveGroup(activeAccount(),team!!)else kit().removeMembers(activeAccount(),team!!,listOf(id));else->error("Unknown role")};JSONObject().put("ok",true)}
            "logout"->{
                phase="signing out"
                stopSync();HubOfficeService.stop(context)
                try{account?.let{engine?.signOut(it,false)}}finally{signedOut=true;store.put("hub.signedOut","true");cryptoCalls.values.forEach{it.completeExceptionally(IllegalStateException("Signed out"))}}
                phase="idle";JSONObject().put("ok",true)
            }
            else->error("Unsupported hub operation")
        } }
    }
    companion object {
        /** How long a signer prompt may wait for the user before the operation fails. */
        private const val CRYPTO_TIMEOUT_SECONDS = 90L

        fun errorMessage(error:Throwable,fallback:String="Could not synchronize your team. Check your relays and try again."):String {
            val cause=error.cause?:error
            return when(cause.javaClass.simpleName){
                "UnknownAccount","OnboardingRequired"->"Connect your Nostr identity to continue."
                "GroupHydrationPending","GroupCatchingUp","GroupCommitPending","GroupCommitUndelivered"->"Your team is still synchronizing. Keep the app open and try again."
                "GroupRemoved","UnknownGroup"->"This phone needs a new team invitation. Ask an administrator."
                "ExternalSignerUnavailable","ExternalSignerRejected"->"Unlock your identity or reconnect your signer, then try again."
                "NoUsableRelay","TransportClosed","RuntimeStopping"->"The relay connection is unavailable. Reopen the app and try again."
                "OnboardingActionUnavailable"->"Identity setup is not ready. Check your signer and relay connections, then try again."
                else->if(cause is MarmotKitException)fallback else cause.message?.takeIf{it.isNotBlank()}?.take(240)?:fallback
            }
        }
        @Volatile private var instance:HubRuntime?=null
        @JvmStatic fun get(context:Context):HubRuntime=instance?:synchronized(this){instance?:HubRuntime(context.applicationContext).also{instance=it}}
        fun arrayStrings(array:JSONArray)=(0 until array.length()).map{array.getString(it)}
    }
}
