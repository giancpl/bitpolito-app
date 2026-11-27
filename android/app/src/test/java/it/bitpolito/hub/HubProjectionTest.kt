package it.bitpolito.hub
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class HubProjectionTest {
    private val alice="a".repeat(64);private val bob="b".repeat(64);private val cara="c".repeat(64)
    private val base=Instant.parse("2026-11-26T09:00:00Z").epochSecond
    private fun op(type:String,id:String,n:Long,author:String=alice,data:JSONObject=JSONObject(),at:Long=base+n)=JSONObject().put("version",1).put("id",id).put("team","test-team").put("device","phone-$author").put("sequence",n).put("revision",n).put("createdAt",at).put("type",type).put("data",data).toString()
    private fun data(request:String)=JSONObject().put("request",request)
    private fun projection(at:Long=base+20)=HubProjection("test-team"){at}.apply{members[alice]=true;members[bob]=false;members[cara]=false}
    @Test fun twoRespondersAndManualEntryThenImmediateLeaveConverge() {
        val events=listOf(
            alice to op("presence","alice-in",1,data=JSONObject().put("action","arrive")),
            bob to op("presence","bob-in",2,bob,JSONObject().put("action","arrive")),
            cara to op("ring","door",3,cara),
            alice to op("offer","alice-offer",4,data=data("door")),
            bob to op("offer","bob-offer",5,bob,data("door")),
        )
        val p=projection();events.forEach{(author,event)->p.ingest(event,author,author==alice)}
        assertEquals(2,p.request("door")!!.getJSONArray("responders").length())
        p.ingest(op("inside","cara-inside",6,cara,data("door")),cara,false)
        assertTrue(p.isInside(cara));assertEquals("resolved",p.request("door")!!.getString("status"))
        p.ingest(op("presence","cara-left",7,cara,JSONObject().put("action","leave")),cara,false)
        assertFalse(p.isInside(cara))
        assertFalse(p.ingest(op("inside","cara-inside",6,cara,data("door")),cara,false))
        assertFalse(p.isInside(cara))
        repeat(20){val q=projection();(events+listOf(cara to op("inside","cara-inside",6,cara,data("door")),cara to op("presence","cara-left",7,cara,JSONObject().put("action","leave")))).shuffled().forEach{(a,e)->q.ingest(e,a,a==alice)};assertEquals(p.state(cara).toString(),q.state(cara).toString())}
    }
    @Test fun outsideRespondersAndForgedInsideCannotActivatePresence(){
        val p=projection();p.ingest(op("presence","alice-in",1,data=JSONObject().put("action","arrive")),alice,true);p.ingest(op("ring","door",2,cara),cara,false)
        p.ingest(op("offer","outside-offer",3,bob,data("door")),bob,false)
        p.ingest(op("inside","forged-entry",4,bob,data("door")),bob,false)
        assertEquals(0,p.request("door")!!.getJSONArray("responders").length());assertFalse(p.isInside(bob))
    }
    @Test fun cancellationExpiryAndRestartNeverReviveARequest(){
        val p=projection();p.ingest(op("presence","alice-in",1,data=JSONObject().put("action","arrive")),alice,true);p.ingest(op("ring","door",2,cara),cara,false);p.ingest(op("cancel","cancelled",3,cara,data("door")),cara,false)
        p.ingest(op("inside","late-inside",4,cara,data("door")),cara,false);assertFalse(p.isInside(cara))
        val restored=projection(base+400);restored.restore(p.export());assertEquals("cancelled",restored.request("door")!!.getString("status"))
        val expired=projection(base+400);expired.ingest(op("presence","alice-in",1,data=JSONObject().put("action","arrive")),alice,true);expired.ingest(op("ring","expired",2,cara),cara,false);assertEquals("expired",expired.request("expired")!!.getString("status"))
    }
    @Test fun unauthorizedResourceWritesAreRejected(){val p=projection();try{p.ingest(op("resource","bad",1,bob,JSONObject().put("id","resource")),bob,false);fail("Member must not write resources")}catch(_:IllegalArgumentException){}}
    @Test fun operationIdentifiersAreScopedToAuthenticatedAuthors(){
        val first=op("presence","same-id",1,data=JSONObject().put("action","arrive"))
        val second=op("presence","same-id",1,bob,JSONObject().put("action","leave"))
        val p=projection();p.ingest(first,alice,true);p.ingest(second,bob,false)
        val q=projection();q.ingest(second,bob,false);q.ingest(first,alice,true)
        assertTrue(p.isInside(alice));assertFalse(p.isInside(bob));assertEquals(p.state(cara).toString(),q.state(cara).toString())
    }
    @Test fun replacingAPhoneCannotReviveItsOldPresence(){
        val p=projection();val old=op("presence","old-phone",1,bob,JSONObject().put("action","arrive"))
        p.ingest(old,bob,false);assertTrue(p.isInside(bob))
        p.ingest(op("member-reset","phone-replaced",2,data=JSONObject().put("member",bob)),alice,true)
        assertFalse(p.isInside(bob));p.ingest(old,bob,false);assertFalse(p.isInside(bob))
        p.ingest(op("presence","new-phone",3,bob,JSONObject().put("action","arrive")),bob,false);assertTrue(p.isInside(bob))
    }
    @Test fun revocationDoesNotUndoAnAlreadyConfirmedEntry(){
        val p=projection();p.ingest(op("presence","bob-here",1,bob,JSONObject().put("action","arrive")),bob,false)
        p.ingest(op("ring","door",2,cara),cara,false);p.ingest(op("inside","entered",3,cara,data("door")),cara,false)
        assertTrue(p.isInside(cara));p.members.remove(bob)
        assertTrue(p.isInside(cara));assertEquals("resolved",p.request("door")!!.getString("status"));assertFalse(p.isInside(bob))
    }
    @Test fun romeMidnightRespectsSummerAndWinterTime(){
        assertEquals(Instant.parse("2026-03-29T22:00:00Z").epochSecond,HubProjection.midnight(Instant.parse("2026-03-29T00:00:00Z").epochSecond))
        assertEquals(Instant.parse("2026-10-25T23:00:00Z").epochSecond,HubProjection.midnight(Instant.parse("2026-10-25T00:00:00Z").epochSecond))
    }
    @Test fun profileAnnouncementCarriesMemberNameIntoNewEpoch() {
        val p = projection()
        p.ingest(op("profile", "adm-bob", 1, bob, JSONObject().put("name", "Bob").put("about", "")), bob, false)
        val announcement = p.profileAnnouncement(bob)
        assertNotNull(announcement)
        assertEquals("Bob", announcement!!.getJSONObject("data").getString("name"))

        val q = projection()
        q.ingest(announcement.toString(), bob, false)
        val bobUser = (0 until q.users().length()).map { q.users().getJSONObject(it) }.first { it.getString("id") == bob }
        assertEquals("Bob", bobUser.getString("name"))

        q.ingest(op("profile", "edit-bob", 2, bob, JSONObject().put("name", "Robert").put("about", "")), bob, false)
        val updatedUser = (0 until q.users().length()).map { q.users().getJSONObject(it) }.first { it.getString("id") == bob }
        assertEquals("Robert", updatedUser.getString("name"))
    }
}
