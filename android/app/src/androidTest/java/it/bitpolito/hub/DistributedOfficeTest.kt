package it.bitpolito.hub

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import dev.ipf.marmotkit.*
import kotlinx.coroutines.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.UUID

/** Three independent encrypted runtimes, disposable identities and only local relays. */
@RunWith(AndroidJUnit4::class)
class DistributedOfficeTest {
    @Test fun threeDeviceOfficeConvergesWithoutApplicationServer()=runBlocking {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val testId=UUID.randomUUID().toString()
        val relays=listOf("ws://127.0.0.1:3480","ws://127.0.0.1:3481")
        val options=(0..2).map { i->MarmotOptions(relayPolicy=RelayPolicyFfi.ALLOW_LOOPBACK,deployment=marmotDeploymentNeutral().apply{keychainService="it.bitpolito.test.$testId.$i"}) }
        val roots=(0..2).map{File(context.noBackupFilesDir,"office-test-$testId-$it")}
        val kits=roots.mapIndexed{i,root->Marmot.newWithConfiguration(root.absolutePath,relays,options[i])}.toMutableList()
        try {
            kits.forEach{it.start()}
            val accounts=kits.map{it.createIdentity(relays,emptyList(),relays).accountIdHex}
            val group=requireNotNull(kits[0].createGroup(accounts[0],"Disposable office",accounts.drop(1),"bitpolito.hub.v1").groupIdHex)
            for(i in 1..2){var accepted=false;repeat(80){if(!accepted)try{kits[i].acceptGroupInvite(accounts[i],group);accepted=true}catch(_:Exception){delay(500)}};assertTrue("Device $i received Welcome",accepted)}
            val projections=accounts.map{HubProjection(group).apply{accounts.forEachIndexed{i,account->members[account]=i==0}}}
            var sequence=0L
            suspend fun send(i:Int,type:String,data:JSONObject=JSONObject()):String {
                sequence++
                val id=UUID.randomUUID().toString()
                val op=JSONObject().put("version",1).put("id",id).put("team",group).put("device","test-$i").put("sequence",sequence).put("revision",sequence).put("createdAt",System.currentTimeMillis()/1000).put("type",type).put("data",data)
                assertTrue(kits[i].sendCustomEvent(accounts[i],group,78uL,emptyList(),op.toString()).published>0u)
                return id
            }
            suspend fun converge(check:()->Boolean){
                repeat(100){
                    kits.forEachIndexed{i,kit->for(m in kit.messages(accounts[i],group,1000u,listOf(78uL)))if(!m.invalidated)projections[i].ingest(m.plaintext,m.sender,m.sender==accounts[0])}
                    if(check())return
                    delay(300)
                }
                fail("Independent office runtimes did not converge")
            }
            send(0,"presence",JSONObject().put("action","arrive"));send(1,"presence",JSONObject().put("action","arrive"))
            converge{projections.all{it.isInside(accounts[0])&&it.isInside(accounts[1])}}
            val request=send(2,"ring")
            converge{projections.all{it.request(request)!=null}}
            // Concurrent application messages need no exclusive server lease.
            coroutineScope{listOf(0,1).map{i->async{send(i,"offer",JSONObject().put("request",request))}}.awaitAll()}
            converge{projections.all{it.request(request)!!.getJSONArray("responders").length()==2}}
            send(1,"release",JSONObject().put("request",request))
            converge{projections.all{it.request(request)!!.getJSONArray("responders").length()==1}}
            send(2,"inside",JSONObject().put("request",request));converge{projections.all{it.isInside(accounts[2])}}
            send(2,"presence",JSONObject().put("action","leave"));converge{projections.all{!it.isInside(accounts[2])&&it.request(request)!!.getString("status")=="resolved"}}
            kits[2].shutdownAndClose();kits[2]=Marmot.newWithConfiguration(roots[2].absolutePath,relays,options[2]);kits[2].start()
            val restored=HubProjection(group).apply{accounts.forEachIndexed{i,a->members[a]=i==0}}
            for(m in kits[2].messages(accounts[2],group,1000u,listOf(78uL)))if(!m.invalidated)restored.ingest(m.plaintext,m.sender,m.sender==accounts[0])
            assertFalse("Replay after restart must retain immediate departure",restored.isInside(accounts[2]))
            assertEquals("resolved",restored.request(request)!!.getString("status"))
            // Replace the disposable Bob phone without copying its MLS database.
            val replacement=Marmot.newWithConfiguration(File(context.noBackupFilesDir,"office-test-$testId-replacement").absolutePath,relays,MarmotOptions(relayPolicy=RelayPolicyFfi.ALLOW_LOOPBACK,deployment=marmotDeploymentNeutral().apply{keychainService="it.bitpolito.test.$testId.replacement"}))
            kits.add(replacement);replacement.start()
            delay(1100)
            val recovered=replacement.login(kits[1].revealNsec(accounts[1]),relays,relays,relays)
            assertEquals(accounts[1],recovered.accountIdHex)
            // Single-phone recovery explicitly retires foreign public KeyPackage slots.
            val inventory=replacement.refreshAccountKeyPackages(accounts[1],relays)
            val foreign=inventory.filter{it.localState==AccountKeyPackageLocalStateFfi.NOT_LOCAL&&it.record.relay}
            assertTrue("The new phone detects the previous installation",foreign.isNotEmpty())
            for(entry in foreign)assertTrue(replacement.deleteAccountKeyPackage(accounts[1],entry.record.eventIdHex,relays)>0u)
            println("Replacement phone retired previous KeyPackages")
            kits[0].removeMembers(accounts[0],group,listOf(accounts[1]))
            var removed=false
            repeat(100){if(!removed){removed=kits[1].groupRoster(accounts[1],group).selfMembership==SelfMembershipFfi.REMOVED;if(!removed)delay(300)}}
            assertTrue("Previous phone received revocation",removed)
            println("Previous phone received group removal")
            kits[0].inviteMembers(accounts[0],group,listOf(accounts[1]))
            var admitted=false
            repeat(100){if(!admitted)try{replacement.acceptGroupInvite(accounts[1],group);admitted=true}catch(_:Exception){delay(300)}}
            assertTrue("Restored identity received a fresh Welcome on its new phone",admitted)
            assertEquals(1u,kits[0].groupRoster(accounts[0],group).members.first{it.memberIdHex==accounts[1]}.deviceCount)
            val marker="after-replacement-$testId"
            assertTrue(kits[0].sendCustomEvent(accounts[0],group,78uL,emptyList(),marker).published>0u)
            var delivered=false
            repeat(100){if(!delivered){delivered=replacement.messages(accounts[1],group,100u,listOf(78uL)).any{it.plaintext==marker};if(!delivered)delay(300)}}
            assertTrue("New phone decrypts future updates",delivered)
            assertFalse("Old phone cannot decrypt future updates",kits[1].messages(accounts[1],group,100u,listOf(78uL)).any{it.plaintext==marker})
            assertFalse("Private payloads must not appear in on-disk protocol records",roots.flatMap{it.walkTopDown().filter{file->file.isFile&&file.length()<16*1024*1024}.toList()}.any{String(it.readBytes(),Charsets.ISO_8859_1).contains(marker)})
        }finally{kits.forEach{try{it.shutdownAndClose()}catch(_:Exception){}}}
    }
}
