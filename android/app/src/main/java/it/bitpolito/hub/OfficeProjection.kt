package it.bitpolito.hub

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/**
 * Pure deterministic projection for the Office module (presence and door requests).
 * Delegated to by [HubProjection] so future tool modules can follow the same pattern.
 */
internal object OfficeProjection {
    val operationTypes = setOf("presence", "ring", "offer", "release", "inside", "cancel")

    fun validate(kind: String, data: JSONObject) {
        when (kind) {
            "presence" -> require(data.getString("action") in listOf("arrive", "leave")) {
                "Unknown presence action"
            }
            "offer", "release", "inside", "cancel" ->
                require(data.getString("request").matches(Regex("[A-Za-z0-9_-]{1,80}"))) {
                    "Invalid request reference"
                }
        }
    }

    fun project(
        ordered: List<JSONObject>,
        members: Map<String, Boolean>,
        now: Long,
        nameOf: (String) -> String,
    ): Pair<Map<String, JSONObject>, Map<String, JSONObject>> {
        val presence = linkedMapOf<String, JSONObject>()
        val requests = linkedMapOf<String, JSONObject>()
        val lastRing = mutableMapOf<String, Long>()

        fun present(id: String, at: Long): Boolean {
            val op = presence[id] ?: return false
            return (op.getString("type") == "inside" ||
                op.getJSONObject("data").optString("action") == "arrive") &&
                midnight(op.getLong("createdAt")) > at
        }

        fun checkIn(op: JSONObject) {
            val author = op.getString("author")
            val old = presence[author]
            if (old == null || old.getString("device") != op.getString("device") ||
                old.getLong("sequence") < op.getLong("sequence")
            ) {
                presence[author] = op
            }
        }

        for (op in ordered) {
            val author = op.getString("author")
            val type = op.getString("type")
            val at = op.getLong("createdAt")
            val data = op.getJSONObject("data")

            if (type == "member-reset") {
                val member = data.getString("member")
                presence.remove(member)
                lastRing.remove(member)
                for (request in requests.values) {
                    if (request.getString("requesterId") == member &&
                        request.getString("status") == "waiting"
                    ) {
                        request.put("status", "cancelled").put("updatedAt", at)
                    }
                    val offers = request.getJSONArray("responders")
                    request.put(
                        "responders",
                        JSONArray(
                            (0 until offers.length())
                                .map { offers.getJSONObject(it) }
                                .filter { it.getString("id") != member },
                        ),
                    )
                }
                continue
            }

            if (type == "presence") {
                checkIn(op)
                continue
            }

            if (type == "ring") {
                if (present(author, at) || (lastRing[author] ?: 0) + 60 > at) continue
                if (presence.keys.none { it != author && present(it, at) }) continue
                if (requests.values.any {
                        it.getString("requesterId") == author &&
                            it.getString("status") == "waiting" &&
                            it.getLong("expiresAt") > at
                    }
                ) continue
                lastRing[author] = at
                if (requests.containsKey(op.getString("id"))) continue
                requests[op.getString("id")] = JSONObject()
                    .put("id", op.getString("id"))
                    .put("requesterId", author)
                    .put("requesterName", nameOf(author))
                    .put("status", "waiting")
                    .put("createdAt", at)
                    .put("expiresAt", at + 180)
                    .put("responders", JSONArray())
                    .put("resolvedReason", JSONObject.NULL)
                    .put("updatedAt", at)
                continue
            }

            if (type !in listOf("offer", "release", "inside", "cancel")) continue
            val r = requests[data.optString("request")] ?: continue
            if (r.getString("status") != "waiting" ||
                at < r.getLong("createdAt") ||
                at > r.getLong("expiresAt")
            ) continue

            val mine = r.getString("requesterId") == author
            if (type in listOf("inside", "cancel")) {
                if (!mine) continue
                r.put("status", if (type == "inside") "resolved" else "cancelled")
                    .put("updatedAt", at)
                if (type == "inside") {
                    r.put("resolvedReason", "inside")
                    checkIn(op)
                }
            } else {
                if (mine || !present(author, at)) continue
                val previous = r.getJSONArray("responders")
                val offers = JSONArray()
                for (i in 0 until previous.length()) {
                    if (previous.getJSONObject(i).getString("id") != author) {
                        offers.put(previous.getJSONObject(i))
                    }
                }
                if (type == "offer") {
                    offers.put(
                        JSONObject()
                            .put("id", author)
                            .put("name", nameOf(author))
                            .put("until", at + 90),
                    )
                    r.put(
                        "expiresAt",
                        maxOf(r.getLong("expiresAt"), minOf(r.getLong("createdAt") + 300, at + 90)),
                    )
                }
                r.put("responders", offers).put("updatedAt", at)
            }
        }

        for (r in requests.values) {
            val previous = r.getJSONArray("responders")
            val active = JSONArray()
            for (i in 0 until previous.length()) {
                val offer = previous.getJSONObject(i)
                if (offer.getLong("until") > now &&
                    members.containsKey(offer.getString("id")) &&
                    present(offer.getString("id"), now)
                ) {
                    active.put(offer)
                }
            }
            r.put("responders", active)
            if (r.getString("status") == "waiting") {
                r.put(
                    "status",
                    if (r.getLong("expiresAt") <= now) "expired"
                    else if (active.length() > 0) "claimed"
                    else "waiting",
                )
            }
            r.put("claimedBy", active.optJSONObject(0)?.getString("id") ?: JSONObject.NULL)
                .put("claimerName", active.optJSONObject(0)?.getString("name") ?: JSONObject.NULL)
                .put("claimUntil", active.optJSONObject(0)?.getLong("until") ?: JSONObject.NULL)
        }
        return presence to requests
    }

    fun isInside(
        presence: Map<String, JSONObject>,
        members: Map<String, Boolean>,
        id: String,
        now: Long,
    ): Boolean {
        if (!members.containsKey(id)) return false
        val op = presence[id] ?: return false
        return (op.getString("type") == "inside" ||
            op.getJSONObject("data").optString("action") == "arrive") &&
            midnight(op.getLong("createdAt")) > now
    }

    fun state(
        presence: Map<String, JSONObject>,
        requests: Map<String, JSONObject>,
        members: Map<String, Boolean>,
        user: String,
        now: Long,
        nameOf: (String) -> String,
    ): JSONObject {
        val people = JSONArray()
        for ((id, op) in presence) {
            if (members.containsKey(id) &&
                (op.getString("type") == "inside" ||
                    op.getJSONObject("data").optString("action") == "arrive") &&
                midnight(op.getLong("createdAt")) > now
            ) {
                people.put(
                    JSONObject()
                        .put("id", id)
                        .put("name", nameOf(id))
                        .put("expiresAt", midnight(op.getLong("createdAt"))),
                )
            }
        }
        val own = requests.values
            .filter { it.getString("requesterId") == user }
            .maxWithOrNull(compareBy({ it.getLong("createdAt") }, { it.getString("id") }))
        val isPresent = (0 until people.length()).any {
            people.getJSONObject(it).getString("id") == user
        }
        val incoming = if (isPresent) {
            requests.values.filter {
                members.containsKey(it.getString("requesterId")) &&
                    it.getString("requesterId") != user &&
                    it.getString("status") in listOf("waiting", "claimed")
            }
        } else {
            emptyList()
        }
        return JSONObject()
            .put("office", "BitPolito Office")
            .put("serverTime", now)
            .put("presence", people)
            .put("own", own ?: JSONObject.NULL)
            .put("incoming", JSONArray(incoming))
    }

    fun presenceAnnouncement(presence: Map<String, JSONObject>, user: String): JSONObject? =
        presence[user]?.let { source ->
            JSONObject(source.toString())
                .apply {
                    remove("author")
                    remove("adminAtReceipt")
                }
                .put("id", "presence-${source.getString("id").removePrefix("presence-")}")
                .put("type", "presence")
                .put(
                    "data",
                    JSONObject().put(
                        "action",
                        if (source.getString("type") == "inside") "arrive"
                        else source.getJSONObject("data").getString("action"),
                    ),
                )
        }

    fun midnight(seconds: Long): Long =
        Instant.ofEpochSecond(seconds)
            .atZone(ZoneId.of("Europe/Rome"))
            .toLocalDate()
            .plusDays(1)
            .atStartOfDay(ZoneId.of("Europe/Rome"))
            .toEpochSecond()
}
