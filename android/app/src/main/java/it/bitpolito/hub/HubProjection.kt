package it.bitpolito.hub

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/** Pure deterministic projection. Authentication and historical role evidence come from MDK, never JSON. */
class HubProjection(private val team: String, private val now: () -> Long = {System.currentTimeMillis()/1000}) {
    private val operations = linkedMapOf<String,JSONObject>()
    val members = linkedMapOf<String,Boolean>()
    fun restore(raw: String?) { if(raw!=null) { val rows=JSONArray(raw); for(i in 0 until rows.length()) { val op=rows.getJSONObject(i); operations["${op.getString("author")}:${op.getString("id")}"]=op } } }
    fun export(): String = JSONArray(operations.values.toList()).toString()
    fun invalidate(id:String,author:String):Boolean {val key="$author:$id";if(!operations.containsKey(key))return false;operations.remove(key);return true}
    fun maxRevision():Long=operations.values.maxOfOrNull{it.getLong("revision")}?:0
    fun operation(id:String,author:String):JSONObject?=operations["$author:$id"]?.let{JSONObject(it.toString()).apply{remove("author");remove("adminAtReceipt")}}
    fun ingest(raw: String, authenticatedAuthor: String, adminAtReceipt: Boolean): Boolean {
        require(raw.length<=65536) {"Office update is too large"}
        val op=JSONObject(raw)
        require(op.getInt("version")==1 && op.getString("team")==team) {"Unsupported office update"}
        require(op.getString("id").matches(Regex("[A-Za-z0-9_-]{1,80}"))) {"Invalid operation identifier"}
        require(op.getLong("sequence")>0 && op.getLong("revision")>0 && op.getLong("createdAt")<=now()+120) {"Invalid operation clock"}
        require(op.getLong("sequence")<=9007199254740991L&&op.getLong("revision")<=9007199254740991L&&op.getLong("createdAt")>=0){"Invalid operation clock"}
        require(op.getString("device").length in 1..128){"Invalid device identifier"}
        val kind=op.getString("type")
        require(kind in setOf("profile","presence","ring","offer","release","inside","cancel","resource","snapshot","member-reset")) {"Unsupported office operation"}
        require(authenticatedAuthor.matches(Regex("[a-f0-9]{64}"))) {"Invalid authenticated member"}
        if(kind in setOf("resource","snapshot","member-reset")) require(adminAtReceipt) {"Administrator access required"}
        val data=op.getJSONObject("data")
        when(kind){
            "member-reset"->require(data.getString("member").matches(Regex("[a-f0-9]{64}"))){"Invalid member reset"}
            "presence"->require(data.getString("action") in listOf("arrive","leave")){"Unknown presence action"}
            "profile"->require(data.getString("name").trim().length in 1..60&&data.optString("about").length<=500){"Invalid member profile"}
            "resource"->validateResource(data)
            "snapshot"->{val resources=data.getJSONArray("resources");val profiles=data.getJSONArray("profiles");require(resources.length()<=500&&profiles.length()<=500){"Snapshot is too large"};for(i in 0 until resources.length())validateResource(resources.getJSONObject(i));for(i in 0 until profiles.length())require(profiles.getJSONObject(i).getString("id").matches(Regex("[a-f0-9]{64}"))){"Invalid snapshot member"}}
            "offer","release","inside","cancel"->require(data.getString("request").matches(Regex("[A-Za-z0-9_-]{1,80}"))){"Invalid request reference"}
        }
        val id="$authenticatedAuthor:${op.getString("id")}"
        val previous=operations[id]
        // If an authenticated author equivocates on an ID, every replica picks the same payload.
        if(previous!=null){val candidate=JSONObject(op.toString()).apply{remove("author");remove("adminAtReceipt")}.toString();val prior=JSONObject(previous.toString()).apply{remove("author");remove("adminAtReceipt")}.toString();if(candidate>=prior)return false}
        // Provenance is supplied only by the native authenticated transport.
        op.put("author",authenticatedAuthor).put("adminAtReceipt",adminAtReceipt)
        operations[id]=op
        return true
    }
    private fun ordered()=operations.values.sortedWith(compareBy<JSONObject>({it.getLong("revision")},{it.getString("author")},{it.getString("id")}))
    fun profiles():Map<String,JSONObject> {
        val result=linkedMapOf<String,JSONObject>()
        for(op in ordered()) {
            if(op.getString("type")=="snapshot") {
                val list=op.getJSONObject("data").optJSONArray("profiles")?:JSONArray()
                for(i in 0 until list.length()) {val p=list.getJSONObject(i);result.putIfAbsent(p.getString("id"),p)}
            }
            if(op.getString("type")=="profile") {
                val data=op.getJSONObject("data")
                val name=data.optString("name").trim().take(60)
                result[op.getString("author")]=JSONObject().put("id",op.getString("author")).put("name",name).put("about",data.optString("about").take(500))
            }
        }
        return result
    }
    fun users():JSONArray {
        val profiles=profiles()
        return JSONArray(members.map{(id,admin)->JSONObject(profiles[id]?.toString()?:"{}").put("id",id).put("name",profiles[id]?.optString("name")?.ifBlank{null}?:"Teammate ${id.take(6)}").put("about",profiles[id]?.optString("about")?:"").put("role",if(admin)"admin" else "member")})
    }
    private fun name(id:String)=profiles()[id]?.optString("name")?.ifBlank{null}?:"Teammate ${id.take(6)}"
    fun resources():JSONArray {
        val values=linkedMapOf<String,JSONObject>()
        val revisions=mutableMapOf<String,Long>()
        for(op in ordered()) {
            if(op.getString("type")=="snapshot") {
                val list=op.getJSONObject("data").optJSONArray("resources")?:JSONArray()
                for(i in 0 until list.length()) { val row=list.getJSONObject(i);val id=row.getString("id"); if(!values.containsKey(id)){values[id]=row;revisions[id]=row.optLong("revision",0)} }
            }
            if(op.getString("type")=="resource") {
                val row=JSONObject(op.getJSONObject("data").toString());val id=row.getString("id")
                if(op.getLong("revision")>=(revisions[id]?:0)){row.put("updatedAt",op.getLong("createdAt")).put("revision",op.getLong("revision"));values[id]=row;revisions[id]=op.getLong("revision")}
            }
        }
        return JSONArray(values.values.toList())
    }
    private fun office():Pair<Map<String,JSONObject>,Map<String,JSONObject>> {
        val presence=linkedMapOf<String,JSONObject>();val requests=linkedMapOf<String,JSONObject>()
        val lastRing=mutableMapOf<String,Long>()
        fun present(id:String,at:Long):Boolean {val op=presence[id]?:return false;return (op.getString("type")=="inside"||op.getJSONObject("data").optString("action")=="arrive")&&midnight(op.getLong("createdAt"))>at}
        fun checkIn(op:JSONObject){val author=op.getString("author");val old=presence[author];if(old==null||old.getString("device")!=op.getString("device")||old.getLong("sequence")<op.getLong("sequence"))presence[author]=op}
        for(op in ordered()) {
            val author=op.getString("author");val type=op.getString("type");val at=op.getLong("createdAt");val data=op.getJSONObject("data")
            if(type=="member-reset"){
                val member=data.getString("member");presence.remove(member);lastRing.remove(member)
                for(request in requests.values){
                    if(request.getString("requesterId")==member&&request.getString("status")=="waiting")request.put("status","cancelled").put("updatedAt",at)
                    val offers=request.getJSONArray("responders");request.put("responders",JSONArray((0 until offers.length()).map{offers.getJSONObject(it)}.filter{it.getString("id")!=member}))
                }
                continue
            }
            if(type=="presence"){checkIn(op);continue}
            if(type=="ring") {
                if(present(author,at)||(lastRing[author]?:0)+60>at)continue
                if(presence.keys.none{it!=author&&present(it,at)})continue
                if(requests.values.any{it.getString("requesterId")==author&&it.getString("status")=="waiting"&&it.getLong("expiresAt")>at})continue
                lastRing[author]=at
                if(requests.containsKey(op.getString("id")))continue
                requests[op.getString("id")]=JSONObject().put("id",op.getString("id")).put("requesterId",author).put("requesterName",name(author)).put("status","waiting").put("createdAt",at).put("expiresAt",at+180).put("responders",JSONArray()).put("resolvedReason",JSONObject.NULL).put("updatedAt",at)
                continue
            }
            if(type !in listOf("offer","release","inside","cancel"))continue
            val r=requests[data.optString("request")]?:continue
            if(r.getString("status")!="waiting"||at<r.getLong("createdAt")||at>r.getLong("expiresAt"))continue
            val mine=r.getString("requesterId")==author
            if(type in listOf("inside","cancel")) {
                if(!mine)continue
                r.put("status",if(type=="inside")"resolved" else "cancelled").put("updatedAt",at)
                if(type=="inside"){r.put("resolvedReason","inside");checkIn(op)}
            }else {
                if(mine||!present(author,at))continue
                val previous=r.getJSONArray("responders");val offers=JSONArray()
                for(i in 0 until previous.length())if(previous.getJSONObject(i).getString("id")!=author)offers.put(previous.getJSONObject(i))
                if(type=="offer"){offers.put(JSONObject().put("id",author).put("name",name(author)).put("until",at+90));r.put("expiresAt",maxOf(r.getLong("expiresAt"),minOf(r.getLong("createdAt")+300,at+90)))}
                r.put("responders",offers).put("updatedAt",at)
            }
        }
        for(r in requests.values){val previous=r.getJSONArray("responders");val active=JSONArray();for(i in 0 until previous.length()){val offer=previous.getJSONObject(i);if(offer.getLong("until")>now()&&members.containsKey(offer.getString("id"))&&present(offer.getString("id"),now()))active.put(offer)};r.put("responders",active)
            if(r.getString("status")=="waiting")r.put("status",if(r.getLong("expiresAt")<=now())"expired" else if(active.length()>0)"claimed" else "waiting")
            r.put("claimedBy",active.optJSONObject(0)?.getString("id")?:JSONObject.NULL).put("claimerName",active.optJSONObject(0)?.getString("name")?:JSONObject.NULL).put("claimUntil",active.optJSONObject(0)?.getLong("until")?:JSONObject.NULL)
        }
        return presence to requests
    }
    fun isInside(id:String):Boolean {
        if(!members.containsKey(id))return false
        val op=office().first[id]?:return false
        return (op.getString("type")=="inside"||op.getJSONObject("data").optString("action")=="arrive")&&midnight(op.getLong("createdAt"))>now()
    }
    fun state(user:String):JSONObject {
        val (presence,requests)=office();val people=JSONArray()
        for((id,op) in presence)if(members.containsKey(id)&&(op.getString("type")=="inside"||op.getJSONObject("data").optString("action")=="arrive")&&midnight(op.getLong("createdAt"))>now())people.put(JSONObject().put("id",id).put("name",name(id)).put("expiresAt",midnight(op.getLong("createdAt"))))
        val own=requests.values.filter{it.getString("requesterId")==user}.maxWithOrNull(compareBy({it.getLong("createdAt")},{it.getString("id")}))
        val isPresent=(0 until people.length()).any{people.getJSONObject(it).getString("id")==user}
        val incoming=if(isPresent)requests.values.filter{members.containsKey(it.getString("requesterId"))&&it.getString("requesterId")!=user&&it.getString("status") in listOf("waiting","claimed")}else emptyList()
        return JSONObject().put("office","BitPolito Office").put("serverTime",now()).put("presence",people).put("own",own?:JSONObject.NULL).put("incoming",JSONArray(incoming))
    }
    fun request(id:String):JSONObject?=office().second[id]
    /** Reannounce an existing declaration into a new MLS epoch without changing its time or lease. */
    fun presenceAnnouncement(user:String):JSONObject?=office().first[user]?.let{source->
        JSONObject(source.toString()).apply{remove("author");remove("adminAtReceipt")}.put("id","presence-${source.getString("id").removePrefix("presence-")}").put("type","presence").put("data",JSONObject().put("action",if(source.getString("type")=="inside")"arrive" else source.getJSONObject("data").getString("action")))
    }
    /** Reannounce the latest self-authored profile into a new MLS epoch so newly admitted members learn the member's name. */
    fun profileAnnouncement(user: String): JSONObject? =
        ordered().lastOrNull { it.getString("author") == user && it.getString("type") == "profile" }?.let { source ->
            JSONObject(source.toString())
                .apply { remove("author"); remove("adminAtReceipt") }
                .put("id", "profile-${source.getString("id").removePrefix("profile-")}")
        }
    companion object {
        fun validateResource(row:JSONObject) {
            require(row.getString("id").length in 1..128&&row.getString("title").trim().length in 1..120&&row.optString("description").length<=2000&&row.getString("category").trim().length in 1..60){"Enter a title and category within the length limits"}
            require(row.getString("type") in listOf("tool","resource")&&row.getString("status") in listOf("active","archived")){"Invalid resource type or status"}
            val url=java.net.URI(row.getString("url"));require(url.scheme in listOf("http","https")&&url.host!=null&&url.rawUserInfo==null){"Use a valid HTTP or HTTPS resource link"}
        }
        fun midnight(seconds:Long):Long=Instant.ofEpochSecond(seconds).atZone(ZoneId.of("Europe/Rome")).toLocalDate().plusDays(1).atStartOfDay(ZoneId.of("Europe/Rome")).toEpochSecond()
    }
}
