package it.bitpolito.hub

import org.json.JSONObject

/** A running voluntary listener may alert once per phase; reconstructed history never rings. */
object HubAlertPolicy {
    fun phase(
        createdAt: Long,
        expiresAt: Long,
        status: String,
        now: Long,
        listeningSince: Long,
        present: Boolean,
        ringSeen: Boolean,
        reminderSeen: Boolean,
    ): String? {
        if (!present || status != "waiting" || expiresAt <= now || createdAt < listeningSince) return null
        val age = now - createdAt
        if (age in 0..15 && !ringSeen) return "ring"
        // A temporary relay outage may have hidden the first sound. This is still a live listener.
        if (age in 60..75 && !reminderSeen) return "reminder"
        return null
    }

    /** What the office foreground service should do after the user changed presence or a door request. */
    enum class Listener {
        /** Not in the office and no own request in progress: stop listening. */
        STOP,
        /** In the office with alerts enabled, or in the office while an own request is active. */
        LISTEN,
        /** Outside the office, following only the user's own active door request. */
        FOLLOW_REQUEST,
    }

    /**
     * Decides the listener mode from an office state snapshot (the `moo` projection).
     * [alertsEnabled] is only consulted when the decision depends on it.
     */
    fun listener(state: JSONObject, me: String?, alertsEnabled: () -> Boolean): Listener {
        val people = state.getJSONArray("presence")
        val present = (0 until people.length()).any { people.getJSONObject(it).getString("id") == me }
        val own = state.optJSONObject("own")
        val active = own != null && own.optString("status") in listOf("waiting", "claimed")
        return when {
            active && !present -> Listener.FOLLOW_REQUEST
            active || (present && alertsEnabled()) -> Listener.LISTEN
            else -> Listener.STOP
        }
    }
}
