package it.bitpolito.hub

import org.json.JSONArray
import org.json.JSONObject

/** Pure deterministic projection. Authentication and historical role evidence come from MDK, never JSON. */
class HubProjection(
    private val team: String,
    private val now: () -> Long = { System.currentTimeMillis() / 1000 },
) {
    private val operations = linkedMapOf<String, JSONObject>()
    val members = linkedMapOf<String, Boolean>()

    fun restore(raw: String?) {
        if (raw != null) {
            val rows = JSONArray(raw)
            for (i in 0 until rows.length()) {
                val op = rows.getJSONObject(i)
                operations["${op.getString("author")}:${op.getString("id")}"] = op
            }
        }
    }

    fun export(): String = JSONArray(operations.values.toList()).toString()

    fun invalidate(id: String, author: String): Boolean {
        val key = "$author:$id"
        if (!operations.containsKey(key)) return false
        operations.remove(key)
        return true
    }

    fun maxRevision(): Long = operations.values.maxOfOrNull { it.getLong("revision") } ?: 0

    fun operation(id: String, author: String): JSONObject? =
        operations["$author:$id"]?.let {
            JSONObject(it.toString()).apply {
                remove("author")
                remove("adminAtReceipt")
            }
        }

    fun ingest(raw: String, authenticatedAuthor: String, adminAtReceipt: Boolean): Boolean {
        require(raw.length <= 65536) { "Office update is too large" }
        val op = JSONObject(raw)
        require(op.getInt("version") == 1 && op.getString("team") == team) { "Unsupported office update" }
        require(op.getString("id").matches(Regex("[A-Za-z0-9_-]{1,80}"))) { "Invalid operation identifier" }
        require(op.getLong("sequence") > 0 && op.getLong("revision") > 0 && op.getLong("createdAt") <= now() + 120) {
            "Invalid operation clock"
        }
        require(
            op.getLong("sequence") <= 9007199254740991L &&
                op.getLong("revision") <= 9007199254740991L &&
                op.getLong("createdAt") >= 0,
        ) { "Invalid operation clock" }
        require(op.getString("device").length in 1..128) { "Invalid device identifier" }

        val kind = op.getString("type")
        val supported = setOf("profile", "resource", "snapshot", "member-reset") + OfficeProjection.operationTypes
        require(kind in supported) { "Unsupported office operation" }
        require(authenticatedAuthor.matches(Regex("[a-f0-9]{64}"))) { "Invalid authenticated member" }
        if (kind in setOf("resource", "snapshot", "member-reset")) {
            require(adminAtReceipt) { "Administrator access required" }
        }

        val data = op.getJSONObject("data")
        when (kind) {
            "member-reset" ->
                require(data.getString("member").matches(Regex("[a-f0-9]{64}"))) { "Invalid member reset" }
            "profile" ->
                require(data.getString("name").trim().length in 1..60 && data.optString("about").length <= 500) {
                    "Invalid member profile"
                }
            "resource" -> validateResource(data)
            "snapshot" -> {
                val resources = data.getJSONArray("resources")
                val profiles = data.getJSONArray("profiles")
                require(resources.length() <= 500 && profiles.length() <= 500) { "Snapshot is too large" }
                for (i in 0 until resources.length()) validateResource(resources.getJSONObject(i))
                for (i in 0 until profiles.length()) {
                    require(profiles.getJSONObject(i).getString("id").matches(Regex("[a-f0-9]{64}"))) {
                        "Invalid snapshot member"
                    }
                }
            }
            else -> OfficeProjection.validate(kind, data)
        }

        val id = "$authenticatedAuthor:${op.getString("id")}"
        val previous = operations[id]
        // If an authenticated author equivocates on an ID, every replica picks the same payload.
        if (previous != null) {
            val candidate = JSONObject(op.toString()).apply {
                remove("author")
                remove("adminAtReceipt")
            }.toString()
            val prior = JSONObject(previous.toString()).apply {
                remove("author")
                remove("adminAtReceipt")
            }.toString()
            if (candidate >= prior) return false
        }
        // Provenance is supplied only by the native authenticated transport.
        op.put("author", authenticatedAuthor).put("adminAtReceipt", adminAtReceipt)
        operations[id] = op
        return true
    }

    private fun ordered() = operations.values.sortedWith(
        compareBy<JSONObject>({ it.getLong("revision") }, { it.getString("author") }, { it.getString("id") }),
    )

    fun profiles(): Map<String, JSONObject> {
        val result = linkedMapOf<String, JSONObject>()
        for (op in ordered()) {
            if (op.getString("type") == "snapshot") {
                val list = op.getJSONObject("data").optJSONArray("profiles") ?: JSONArray()
                for (i in 0 until list.length()) {
                    val p = list.getJSONObject(i)
                    result.putIfAbsent(p.getString("id"), p)
                }
            }
            if (op.getString("type") == "profile") {
                val data = op.getJSONObject("data")
                val name = data.optString("name").trim().take(60)
                result[op.getString("author")] = JSONObject()
                    .put("id", op.getString("author"))
                    .put("name", name)
                    .put("about", data.optString("about").take(500))
            }
        }
        return result
    }

    fun users(): JSONArray {
        val profiles = profiles()
        return JSONArray(
            members.map { (id, admin) ->
                JSONObject(profiles[id]?.toString() ?: "{}")
                    .put("id", id)
                    .put("name", profiles[id]?.optString("name")?.ifBlank { null } ?: "Teammate ${id.take(6)}")
                    .put("about", profiles[id]?.optString("about") ?: "")
                    .put("role", if (admin) "admin" else "member")
            },
        )
    }

    private fun name(id: String) =
        profiles()[id]?.optString("name")?.ifBlank { null } ?: "Teammate ${id.take(6)}"

    fun resources(): JSONArray {
        val values = linkedMapOf<String, JSONObject>()
        val revisions = mutableMapOf<String, Long>()
        for (op in ordered()) {
            if (op.getString("type") == "snapshot") {
                val list = op.getJSONObject("data").optJSONArray("resources") ?: JSONArray()
                for (i in 0 until list.length()) {
                    val row = list.getJSONObject(i)
                    val id = row.getString("id")
                    if (!values.containsKey(id)) {
                        values[id] = row
                        revisions[id] = row.optLong("revision", 0)
                    }
                }
            }
            if (op.getString("type") == "resource") {
                val row = JSONObject(op.getJSONObject("data").toString())
                val id = row.getString("id")
                if (op.getLong("revision") >= (revisions[id] ?: 0)) {
                    row.put("updatedAt", op.getLong("createdAt")).put("revision", op.getLong("revision"))
                    values[id] = row
                    revisions[id] = op.getLong("revision")
                }
            }
        }
        return JSONArray(values.values.toList())
    }

    private fun office() = OfficeProjection.project(ordered(), members, now(), ::name)

    fun isInside(id: String): Boolean = OfficeProjection.isInside(office().first, members, id, now())

    fun state(user: String): JSONObject {
        val (presence, requests) = office()
        return OfficeProjection.state(presence, requests, members, user, now(), ::name)
    }

    fun request(id: String): JSONObject? = office().second[id]

    /** Reannounce an existing declaration into a new MLS epoch without changing its time or lease. */
    fun presenceAnnouncement(user: String): JSONObject? =
        OfficeProjection.presenceAnnouncement(office().first, user)

    /** Reannounce the latest self-authored profile into a new MLS epoch so newly admitted members learn the member's name. */
    fun profileAnnouncement(user: String): JSONObject? =
        ordered().lastOrNull { it.getString("author") == user && it.getString("type") == "profile" }?.let { source ->
            JSONObject(source.toString())
                .apply {
                    remove("author")
                    remove("adminAtReceipt")
                }
                .put("id", "profile-${source.getString("id").removePrefix("profile-")}")
        }

    companion object {
        fun validateResource(row: JSONObject) {
            require(
                row.getString("id").length in 1..128 &&
                    row.getString("title").trim().length in 1..120 &&
                    row.optString("description").length <= 2000 &&
                    row.getString("category").trim().length in 1..60,
            ) { "Enter a title and category within the length limits" }
            require(
                row.getString("type") in listOf("tool", "resource") &&
                    row.getString("status") in listOf("active", "archived"),
            ) { "Invalid resource type or status" }
            val url = java.net.URI(row.getString("url"))
            require(url.scheme in listOf("http", "https") && url.host != null && url.rawUserInfo == null) {
                "Use a valid HTTP or HTTPS resource link"
            }
        }

        fun midnight(seconds: Long): Long = OfficeProjection.midnight(seconds)
    }
}
