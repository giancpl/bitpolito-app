package it.bitpolito.hub

import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.launch
import org.json.JSONObject

@CapacitorPlugin(name="BitPolitoHub")
class HubPlugin:Plugin() {
    private val runtime get()=HubRuntime.get(context)
    override fun load(){
        runtime.visible=true
        runtime.emit={name,value->activity.runOnUiThread{bridge.triggerWindowJSEvent(name,value.toString())}}
        runtime.startSync()
    }
    @PluginMethod fun execute(call:PluginCall){
      if(call.getString("action")=="presence"&&call.getObject("input")?.optString("action")=="leave")HubOfficeService.stop(context)
      runtime.scope.launch{
        try {
            val action=call.getString("action")?:error("Choose a hub operation")
            val diagnostic=BuildConfig.DEBUG&&action in listOf("join","logout","reviewApplication","createTeam")
            if(diagnostic)android.util.Log.d("BitPolitoHub","Operation $action started")
            val result=runtime.command(action,call.getObject("input")?:JSObject())
            if(diagnostic)android.util.Log.d("BitPolitoHub","Operation $action finished")
            val json=JSONObject().put("value",result)
            if(action in listOf("presence","ring","request")&&runtime.visible){
                val state=runtime.command("moo",JSONObject()) as JSONObject
                val me=SecureStore(context).get("hub.account")
                val people=state.getJSONArray("presence");val present=(0 until people.length()).any{people.getJSONObject(it).getString("id")==me}
                val own=state.optJSONObject("own");val active=own!=null&&own.optString("status") in listOf("waiting","claimed")
                activity.runOnUiThread{if(active||(present&&SecureStore(context).get("hub.alerts")=="true"))HubOfficeService.start(context,active&&!present)else HubOfficeService.stop(context)}
            }
            call.resolve(JSObject(json.toString()))
        }catch(e:Exception){call.reject(hubError(e,"Office operation failed"))}
    } }
    @PluginMethod fun login(call:PluginCall){runtime.scope.launch{try{call.resolve(JSObject(runtime.login(call.getString("pubkey")?:"",call.getString("name")?:"",call.getString("invitation")).toString()))}catch(e:Exception){call.reject(hubError(e,"Could not connect your identity"))}}}
    private fun hubError(error:Exception,fallback:String):String {
        // SDK errors can have an empty message. Keep private payloads out of diagnostics.
        val cause=error.cause?:error
        if(BuildConfig.DEBUG)android.util.Log.w("BitPolitoHub", "Operation failed: ${cause.javaClass.simpleName}; frames=${cause.stackTrace.filter{it.className.startsWith("it.bitpolito")}.take(4).joinToString { "${it.className}.${it.methodName}:${it.lineNumber}" }}")
        return HubRuntime.errorMessage(error,fallback)
    }
    @PluginMethod fun cryptoReply(call:PluginCall){runtime.reply(call.getString("id")?:"",call.getString("value"),call.getString("error"));call.resolve()}
}
