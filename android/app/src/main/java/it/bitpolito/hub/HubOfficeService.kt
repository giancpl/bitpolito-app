package it.bitpolito.hub

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import org.json.JSONObject

/** User-started listener. No boot receiver, alarms, push gateway or hidden background start. */
class HubOfficeService : Service() {
    private var foregroundStarted = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        running = true
        listeningSince = System.currentTimeMillis() / 1000
        Alerts.channels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "leave") {
            // Ignore a stale "I'm leaving" action that belongs to a previously signed-in account.
            if (intent.getStringExtra("owner") != SecureStore(this).get("hub.account")) {
                if (!foregroundStarted) stopSelf()
                return START_NOT_STICKY
            }
            stop(this)
            HubRuntime.get(this).scope.launch {
                try {
                    HubRuntime.get(this@HubOfficeService).command("presence", JSONObject().put("action", "leave"))
                } catch (_: Exception) {
                }
            }
            return START_NOT_STICKY
        }
        val requestOnly = intent?.getBooleanExtra("requestOnly", false) == true
        val owner = SecureStore(this).get("hub.account")
        val builder = NotificationCompat.Builder(this, Alerts.QUIET)
            .setSmallIcon(R.drawable.ic_doorbell)
            .setContentTitle(if (requestOnly) "Door request active" else "Office alerts active")
            .setContentText(if (requestOnly) "Following your door request" else "Listening for the office doorbell")
            .setOngoing(true)
            .setContentIntent(open(this, null))
        if (!requestOnly) {
            val leave = Intent(this, HubOfficeService::class.java).setAction("leave").putExtra("owner", owner)
            builder.addAction(
                0,
                "I’m leaving",
                PendingIntent.getService(
                    this,
                    (owner?.hashCode() ?: 0) + 81,
                    leave,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
        }
        val notification = builder.build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(ID, notification)
        }
        foregroundStarted = true
        HubRuntime.get(this).startSync()
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        running = false
        HubRuntime.get(this).pauseWhenHidden()
        super.onDestroy()
    }

    companion object {
        private const val ID = 77101

        @Volatile var running = false

        /** Only read and written inside the synchronized [update]. */
        private var lastState: JSONObject? = null

        /** Written on the main thread in onCreate, read by [update] on the sync thread. */
        @Volatile private var listeningSince = 0L

        @JvmOverloads
        fun start(context: Context, requestOnly: Boolean = false) {
            ContextCompat.startForegroundService(
                context,
                Intent(context, HubOfficeService::class.java).putExtra("requestOnly", requestOnly),
            )
        }

        fun stop(context: Context) {
            running = false
            context.stopService(Intent(context, HubOfficeService::class.java))
            Alerts.clear(context)
            HubRuntime.get(context).pauseWhenHidden()
        }

        private fun open(c: Context, request: String?): PendingIntent {
            val intent = Intent(c, MainActivity::class.java).apply {
                if (request != null) putExtra("request", request)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            return PendingIntent.getActivity(
                c,
                request?.hashCode() ?: 0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        @Synchronized
        fun update(context: Context, state: JSONObject, fresh: Boolean = true) {
            if (!running) return
            val store = SecureStore(context)
            val user = store.get("hub.account") ?: return
            val now = System.currentTimeMillis() / 1000
            val present = state.getJSONArray("presence").let { people ->
                (0 until people.length()).any { people.getJSONObject(it).getString("id") == user }
            }
            val own = state.optJSONObject("own")
            val ownActive = own != null && own.optString("status") in listOf("waiting", "claimed")
            if (!present && !ownActive) {
                stop(context)
                return
            }
            // Cached state may expire listening, but cannot authorize a sound before
            // the runtime has checked current MLS membership and received operations.
            if (!fresh) return
            if (!present) {
                lastState = state
                return
            }
            val notifications = context.getSystemService(NotificationManager::class.java)
            val seen = JSONObject(store.get("hub.alerts.seen.$user") ?: "{}")
            val incoming = state.getJSONArray("incoming")
            val waiting = (0 until incoming.length())
                .map { incoming.getJSONObject(it) }
                .filter { it.optString("status") == "waiting" }
                .map { it.getString("id") }
                .toSet()
            lastState?.optJSONArray("incoming")?.let { previous ->
                for (i in 0 until previous.length()) {
                    val id = previous.getJSONObject(i).getString("id")
                    if (id !in waiting) notifications.cancel(id.hashCode())
                }
            }
            for (i in 0 until incoming.length()) {
                val request = incoming.getJSONObject(i)
                val id = request.getString("id")
                if (request.getString("status") != "waiting" || request.getLong("expiresAt") <= now) {
                    notifications.cancel(id.hashCode())
                    continue
                }
                val phase = HubAlertPolicy.phase(
                    request.getLong("createdAt"),
                    request.getLong("expiresAt"),
                    request.getString("status"),
                    now,
                    listeningSince,
                    present,
                    seen.has("$id:ring"),
                    seen.has("$id:reminder"),
                ) ?: continue
                val key = "$id:$phase"
                if (seen.has(key)) continue
                seen.put(key, now)
                if (store.get("hub.alerts") != "true") continue
                if (HubRuntime.get(context).visible) {
                    Alerts.test(context)
                } else if (Alerts.permission(context)) {
                    val n = NotificationCompat.Builder(context, Alerts.configuredChannel(context))
                        .setSmallIcon(R.drawable.ic_doorbell)
                        .setContentTitle("BitPolito · Office")
                        .setContentText("Someone is at the office door.")
                        .setContentIntent(open(context, id))
                        .setAutoCancel(true)
                        .setTimeoutAfter(30000)
                        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                        .build()
                    notifications.notify(id.hashCode(), n)
                }
            }
            seen.keys().asSequence().toList()
                .filter { seen.optLong(it) < now - 86400 }
                .forEach { seen.remove(it) }
            store.put("hub.alerts.seen.$user", seen.toString())
            lastState = state
        }
    }
}
