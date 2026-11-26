package it.bitpolito.hub

/** A running voluntary listener may alert once per phase; reconstructed history never rings. */
object HubAlertPolicy {
    fun phase(createdAt:Long,expiresAt:Long,status:String,now:Long,listeningSince:Long,present:Boolean,ringSeen:Boolean,reminderSeen:Boolean):String? {
        if(!present||status!="waiting"||expiresAt<=now||createdAt<listeningSince)return null
        val age=now-createdAt
        if(age in 0..15&&!ringSeen)return "ring"
        // A temporary relay outage may have hidden the first sound. This is still a live listener.
        if(age in 60..75&&!reminderSeen)return "reminder"
        return null
    }
}
