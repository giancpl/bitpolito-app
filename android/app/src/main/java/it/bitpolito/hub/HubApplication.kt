package it.bitpolito.hub

import android.app.Application
import dev.ipf.marmotkit.MarmotAndroid

class HubApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        MarmotAndroid.initialize(this)
    }
}
