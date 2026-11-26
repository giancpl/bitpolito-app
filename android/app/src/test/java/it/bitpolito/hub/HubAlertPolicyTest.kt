package it.bitpolito.hub
import org.junit.Assert.*
import org.junit.Test
class HubAlertPolicyTest {
    private fun phase(now:Long=110,created:Long=100,expiry:Long=280,status:String="waiting",since:Long=90,present:Boolean=true,ring:Boolean=false,reminder:Boolean=false)=HubAlertPolicy.phase(created,expiry,status,now,since,present,ring,reminder)
    @Test fun outsideClaimedCancelledAndExpiredRequestsNeverSound(){
        assertNull(phase(present=false));assertNull(phase(status="claimed"));assertNull(phase(status="cancelled"));assertNull(phase(expiry=110));assertNull(phase(created=120))
    }
    @Test fun aFreshListenerDoesNotRingForReconstructedHistory(){assertNull(phase(since=105));assertNull(phase(now=161,since=150));assertNull(phase(now=200))}
    @Test fun duplicateEventsAndRepeatedRemindersDoNotRepeatSound(){assertEquals("ring",phase());assertNull(phase(ring=true));assertEquals("reminder",phase(now=161,ring=true));assertNull(phase(now=161,ring=true,reminder=true))}
    @Test fun reconnectingListenerMaySendItsOneLiveReminder(){assertEquals("reminder",phase(now=161));assertNull(phase(now=176));assertNull(phase(now=161,reminder=true))}
}
