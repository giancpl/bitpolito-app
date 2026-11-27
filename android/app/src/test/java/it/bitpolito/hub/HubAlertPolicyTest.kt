package it.bitpolito.hub

import it.bitpolito.hub.HubAlertPolicy.Listener
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HubAlertPolicyTest {
    private fun phase(
        now: Long = 110,
        created: Long = 100,
        expiry: Long = 280,
        status: String = "waiting",
        since: Long = 90,
        present: Boolean = true,
        ring: Boolean = false,
        reminder: Boolean = false,
    ) = HubAlertPolicy.phase(created, expiry, status, now, since, present, ring, reminder)

    @Test fun outsideClaimedCancelledAndExpiredRequestsNeverSound() {
        assertNull(phase(present = false))
        assertNull(phase(status = "claimed"))
        assertNull(phase(status = "cancelled"))
        assertNull(phase(expiry = 110))
        assertNull(phase(created = 120))
    }

    @Test fun aFreshListenerDoesNotRingForReconstructedHistory() {
        assertNull(phase(since = 105))
        assertNull(phase(now = 161, since = 150))
        assertNull(phase(now = 200))
    }

    @Test fun duplicateEventsAndRepeatedRemindersDoNotRepeatSound() {
        assertEquals("ring", phase())
        assertNull(phase(ring = true))
        assertEquals("reminder", phase(now = 161, ring = true))
        assertNull(phase(now = 161, ring = true, reminder = true))
    }

    @Test fun reconnectingListenerMaySendItsOneLiveReminder() {
        assertEquals("reminder", phase(now = 161))
        assertNull(phase(now = 176))
        assertNull(phase(now = 161, reminder = true))
    }

    private val me = "a".repeat(64)
    private val other = "b".repeat(64)

    private fun state(present: List<String> = emptyList(), own: String? = null) = JSONObject()
        .put("presence", JSONArray(present.map { JSONObject().put("id", it) }))
        .put("own", own?.let { JSONObject().put("status", it) } ?: JSONObject.NULL)

    private fun listener(state: JSONObject, alerts: Boolean = false) =
        HubAlertPolicy.listener(state, me) { alerts }

    @Test fun anActiveOwnRequestIsFollowedFromOutsideTheOffice() {
        assertEquals(Listener.FOLLOW_REQUEST, listener(state(own = "waiting")))
        assertEquals(Listener.FOLLOW_REQUEST, listener(state(listOf(other), own = "claimed")))
    }

    @Test fun beingInTheOfficeListensOnlyWithAlertsOrAnActiveRequest() {
        assertEquals(Listener.LISTEN, listener(state(listOf(me)), alerts = true))
        assertEquals(Listener.STOP, listener(state(listOf(me)), alerts = false))
        assertEquals(Listener.LISTEN, listener(state(listOf(me), own = "waiting"), alerts = false))
    }

    @Test fun endedRequestsAndAbsenceStopTheListener() {
        assertEquals(Listener.STOP, listener(state(), alerts = true))
        assertEquals(Listener.STOP, listener(state(listOf(other), own = "resolved"), alerts = true))
        assertEquals(Listener.STOP, listener(state(own = "cancelled")))
    }

    @Test fun alertsPreferenceIsOnlyReadWhenItMatters() {
        HubAlertPolicy.listener(state(own = "waiting"), me) { fail("alerts must not be read"); false }
        HubAlertPolicy.listener(state(), me) { fail("alerts must not be read"); false }
    }
}
