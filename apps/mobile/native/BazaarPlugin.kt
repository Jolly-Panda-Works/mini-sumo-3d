package __PACKAGE__

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.net.Uri
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResult
import androidx.lifecycle.LifecycleOwner
import com.farsitel.bazaar.BazaarClientProxy
import com.farsitel.bazaar.ILoginCheckService
import com.farsitel.bazaar.core.BazaarSignIn
import com.farsitel.bazaar.core.callback.BazaarSignInCallback
import com.farsitel.bazaar.core.model.BazaarSignInOptions
import com.farsitel.bazaar.core.model.SignInOption
import com.farsitel.bazaar.storage.BazaarStorage
import com.farsitel.bazaar.storage.callback.BazaarStorageCallback
import com.farsitel.bazaar.updater.AutoUpdateState
import com.farsitel.bazaar.updater.BazaarAutoUpdater
import com.farsitel.bazaar.updater.BazaarUpdater
import com.farsitel.bazaar.updater.UpdateResult
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import ir.cafebazaar.poolakey.Connection
import ir.cafebazaar.poolakey.Payment
import ir.cafebazaar.poolakey.config.PaymentConfiguration
import ir.cafebazaar.poolakey.config.SecurityCheck
import ir.cafebazaar.poolakey.entity.PurchaseInfo
import ir.cafebazaar.poolakey.request.PurchaseRequest

/**
 * Cafe Bazaar for the web game:
 * - in-app billing (Poolakey): connect, purchase, consume and list unfinished purchases.
 *   The RSA key comes from the bazaar_rsa_key string resource (added by scripts/bazaar.mjs);
 *   Poolakey verifies every purchase's signature with it on the device.
 * - sign in with Bazaar (CafeBazaarAuth) and its in-app storage (10 KB per player in Bazaar's
 *   cloud), and whether the player is logged in to Bazaar (ILoginCheckService),
 * - Bazaar's pages (intents): the game, its review page, the developer's games, the update page,
 * - in-app update and auto-update (BazaarUpdater).
 */
@CapacitorPlugin(name = "Bazaar")
class BazaarPlugin : Plugin() {
    private var payment: Payment? = null
    private var connection: Connection? = null
    private var connected = false

    private fun rsaKey(): String {
        val id = context.resources.getIdentifier("bazaar_rsa_key", "string", context.packageName)
        return if (id == 0) "" else context.getString(id)
    }

    private fun paymentOrNull(): Payment? {
        if (payment == null) {
            val key = rsaKey()
            if (key.isEmpty()) return null
            payment = Payment(
                context = context,
                config = PaymentConfiguration(localSecurityCheck = SecurityCheck.Enable(rsaPublicKey = key)),
            )
        }
        return payment
    }

    private fun toJs(info: PurchaseInfo): JSObject {
        val o = JSObject()
        o.put("orderId", info.orderId)
        o.put("purchaseToken", info.purchaseToken)
        o.put("productId", info.productId)
        o.put("purchaseTime", info.purchaseTime)
        return o
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        if (connected) {
            call.resolve()
            return
        }
        val p = paymentOrNull() ?: run {
            call.reject("The Bazaar key is missing from this build.", "NO_KEY")
            return
        }
        var answered = false
        connection = p.connect {
            connectionSucceed {
                connected = true
                if (!answered) { answered = true; call.resolve() }
            }
            connectionFailed { error ->
                connected = false
                if (!answered) { answered = true; call.reject(error.message ?: "Couldn't connect to Cafe Bazaar.", "NOT_CONNECTED") }
            }
            disconnected { connected = false }
        }
    }

    @PluginMethod
    fun purchase(call: PluginCall) {
        val productId = call.getString("productId")
        val p = payment
        if (productId.isNullOrEmpty()) return call.reject("productId is required.")
        if (p == null || !connected) return call.reject("Not connected to Cafe Bazaar.", "NOT_CONNECTED")
        val activity = activity as? ComponentActivity ?: return call.reject("No activity.")
        val payload = call.getString("payload") ?: ""
        activity.runOnUiThread {
            p.purchaseProduct(
                registry = activity.activityResultRegistry,
                request = PurchaseRequest(productId = productId, payload = payload),
            ) {
                purchaseFlowBegan { }
                failedToBeginFlow { error -> call.reject(error.message ?: "Couldn't start the purchase.", "FAILED") }
                purchaseSucceed { info -> call.resolve(toJs(info)) }
                purchaseCanceled { call.reject("Purchase cancelled.", "CANCELLED") }
                purchaseFailed { error -> call.reject(error.message ?: "The purchase failed.", "FAILED") }
            }
        }
    }

    @PluginMethod
    fun consume(call: PluginCall) {
        val token = call.getString("purchaseToken")
        val p = payment
        if (token.isNullOrEmpty()) return call.reject("purchaseToken is required.")
        if (p == null || !connected) return call.reject("Not connected to Cafe Bazaar.", "NOT_CONNECTED")
        p.consumeProduct(token) {
            consumeSucceed { call.resolve() }
            consumeFailed { error -> call.reject(error.message ?: "Couldn't finish the purchase.", "FAILED") }
        }
    }

    /** Each product's price and title as Cafe Bazaar shows them (in the player's currency). */
    @PluginMethod
    fun skuDetails(call: PluginCall) {
        val p = payment
        if (p == null || !connected) return call.reject("Not connected to Cafe Bazaar.", "NOT_CONNECTED")
        val ids = call.getArray("productIds")?.toList<String>() ?: emptyList()
        if (ids.isEmpty()) return call.reject("productIds is required.")
        p.getInAppSkuDetails(skuIds = ids) {
            getSkuDetailsSucceed { list ->
                val items = JSArray()
                list.forEach { sku ->
                    val o = JSObject()
                    o.put("productId", sku.sku)
                    o.put("price", sku.price)
                    o.put("title", sku.title)
                    items.put(o)
                }
                val result = JSObject()
                result.put("products", items)
                call.resolve(result)
            }
            getSkuDetailsFailed { error -> call.reject(error.message ?: "Couldn't load the prices.", "FAILED") }
        }
    }

    /** Purchases that were paid but not consumed yet (e.g. the app closed mid-purchase). */
    @PluginMethod
    fun purchases(call: PluginCall) {
        val p = payment
        if (p == null || !connected) return call.reject("Not connected to Cafe Bazaar.", "NOT_CONNECTED")
        p.getPurchasedProducts {
            querySucceed { list ->
                val items = JSArray()
                list.forEach { items.put(toJs(it)) }
                val result = JSObject()
                result.put("purchases", items)
                call.resolve(result)
            }
            queryFailed { error -> call.reject(error.message ?: "Couldn't load purchases.", "FAILED") }
        }
    }

    // ------------------------------------------------------------------ sign in & storage

    private fun owner(): LifecycleOwner? = activity as? LifecycleOwner

    /** Bazaar is installed, and whether it's too old for sign-in and in-app storage. */
    @PluginMethod
    fun status(call: PluginCall) {
        val result = JSObject()
        val installed = BazaarClientProxy.isBazaarInstalledOnDevice(context)
        result.put("installed", installed)
        if (installed) {
            val info = BazaarClientProxy.isNeededToUpdateBazaar(context)
            result.put("needsUpdate", info.needToUpdateForAuth || info.needToUpdateForStorage)
        } else {
            result.put("needsUpdate", false)
        }
        call.resolve(result)
    }

    /** Bazaar's own "install Bazaar" / "update Bazaar" screens. */
    @PluginMethod
    fun showInstallBazaar(call: PluginCall) {
        BazaarClientProxy.showInstallBazaarView(activity ?: context)
        call.resolve()
    }

    @PluginMethod
    fun showUpdateBazaar(call: PluginCall) {
        BazaarClientProxy.showUpdateBazaarView(activity ?: context)
        call.resolve()
    }

    private fun accountJs(accountId: String?): JSObject {
        val o = JSObject()
        o.put("accountId", accountId)
        return o
    }

    /** The player who already let this game sign in with Bazaar (accountId null when none). */
    @PluginMethod
    fun account(call: PluginCall) {
        if (!BazaarClientProxy.isBazaarInstalledOnDevice(context)) return call.resolve(accountJs(null))
        BazaarSignIn.getLastSignedInAccount(context, owner(), BazaarSignInCallback { response ->
            call.resolve(accountJs(response?.data?.accountId))
        })
    }

    /** Bazaar's sign-in screen; resolves with the account (null if the player said no). */
    @PluginMethod
    fun signIn(call: PluginCall) {
        if (!BazaarClientProxy.isBazaarInstalledOnDevice(context)) return call.reject("Cafe Bazaar isn't installed.", "NOT_INSTALLED")
        val options = BazaarSignInOptions.Builder(SignInOption.DEFAULT_SIGN_IN).build()
        val intent = BazaarSignIn.getClient(context, options).getSignInIntent()
        startActivityForResult(call, intent, "signInResult")
    }

    @ActivityCallback
    private fun signInResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        call.resolve(accountJs(BazaarSignIn.getSignedInAccountFromIntent(result.data)?.accountId))
    }

    /** The player's save in Bazaar's in-app storage (UTF-8 text; "" when there is none). */
    @PluginMethod
    fun loadData(call: PluginCall) {
        BazaarStorage.getSavedData(context, owner(), BazaarStorageCallback { response ->
            if (response == null || !response.isSuccessful) {
                call.reject(response?.errorResponse?.errorMessage ?: "Couldn't read the Bazaar save.", "FAILED")
            } else {
                val o = JSObject()
                o.put("data", response.data?.toString(Charsets.UTF_8) ?: "")
                call.resolve(o)
            }
        })
    }

    @PluginMethod
    fun saveData(call: PluginCall) {
        val data = call.getString("data") ?: return call.reject("data is required.")
        BazaarStorage.saveData(context, owner(), data.toByteArray(Charsets.UTF_8), BazaarStorageCallback { response ->
            if (response == null || !response.isSuccessful) {
                call.reject(response?.errorResponse?.errorMessage ?: "Couldn't save to Bazaar.", "FAILED")
            } else {
                call.resolve()
            }
        })
    }

    /** Whether the player is logged in to the Bazaar app (null when Bazaar can't say). */
    @PluginMethod
    fun isLoggedIn(call: PluginCall) {
        var answered = false
        val answer = { loggedIn: Boolean? ->
            if (!answered) {
                answered = true
                val o = JSObject()
                o.put("loggedIn", loggedIn)
                call.resolve(o)
            }
        }
        val connection = object : ServiceConnection {
            override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
                val loggedIn = try {
                    ILoginCheckService.Stub.asInterface(service).isLoggedIn()
                } catch (e: Exception) {
                    null
                }
                answer(loggedIn)
                try { context.unbindService(this) } catch (e: Exception) { }
            }

            override fun onServiceDisconnected(name: ComponentName?) {}
        }
        val intent = Intent("com.farsitel.bazaar.service.LoginCheckService.BIND").setPackage(BAZAAR_PACKAGE)
        val bound = try {
            context.bindService(intent, connection, Context.BIND_AUTO_CREATE)
        } catch (e: Exception) {
            false
        }
        if (!bound) return answer(null)
        // An old Bazaar may never answer.
        Handler(Looper.getMainLooper()).postDelayed({
            if (!answered) {
                answer(null)
                try { context.unbindService(connection) } catch (e: Exception) { }
            }
        }, 4000)
    }

    // ------------------------------------------------------------------ Bazaar pages (intents)

    /**
     * Opens a page of Bazaar: "details" (the game), "review" (rate and review it), "developer"
     * (all the developer's games; needs developerId), "update" (the in-app update page) or
     * "login". Without Bazaar, the game's page opens on the Bazaar website.
     */
    @PluginMethod
    fun open(call: PluginCall) {
        val page = call.getString("page") ?: "details"
        val pkg = context.packageName
        val installed = BazaarClientProxy.isBazaarInstalledOnDevice(context)
        val intent = if (!installed) {
            Intent(Intent.ACTION_VIEW, Uri.parse("https://cafebazaar.ir/app/$pkg"))
        } else {
            val (action, uri) = when (page) {
                "review" -> Intent.ACTION_EDIT to "bazaar://details?id=$pkg"
                "developer" -> Intent.ACTION_VIEW to "bazaar://collection?slug=by_author&aid=${call.getString("developerId") ?: ""}"
                "update" -> Intent.ACTION_VIEW to "bazaar://details/modal?id=$pkg"
                "login" -> Intent.ACTION_VIEW to "bazaar://login"
                else -> Intent.ACTION_VIEW to "bazaar://details?id=$pkg"
            }
            Intent(action, Uri.parse(uri)).setPackage(BAZAAR_PACKAGE)
        }
        val starter = activity
        if (starter == null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            (starter ?: context).startActivity(intent)
            val o = JSObject()
            o.put("bazaar", installed)
            call.resolve(o)
        } catch (e: Exception) {
            call.reject("Couldn't open Cafe Bazaar.", "FAILED")
        }
    }

    // ------------------------------------------------------------------ updates (BazaarUpdater)

    /** "updated", "needUpdate" (with the new versionCode) or "error". */
    @PluginMethod
    fun updateState(call: PluginCall) {
        BazaarUpdater.getLastUpdateState(context) { result ->
            val o = JSObject()
            when (result) {
                is UpdateResult.NeedUpdate -> {
                    o.put("state", "needUpdate")
                    o.put("versionCode", result.getTargetVersionCode())
                }
                is UpdateResult.Error -> {
                    o.put("state", "error")
                    o.put("message", result.getError()?.message ?: "")
                }
                else -> o.put("state", "updated")
            }
            call.resolve(o)
        }
    }

    /** Bazaar's update screen for this game (the new version installs from there). */
    @PluginMethod
    fun update(call: PluginCall) {
        try {
            BazaarUpdater.updateApplication(activity ?: context)
            call.resolve()
        } catch (e: Exception) {
            call.reject("Couldn't open the update.", "FAILED")
        }
    }

    /** "enabled", "disabled" or "unsupported" (no Bazaar, or older than 26.2). */
    @PluginMethod
    fun autoUpdateState(call: PluginCall) {
        BazaarAutoUpdater.getLastAutoUpdateState(context) { result ->
            val o = JSObject()
            o.put(
                "state",
                when (result.getState()) {
                    AutoUpdateState.ENABLED -> "enabled"
                    AutoUpdateState.DISABLED -> "disabled"
                    else -> "unsupported"
                },
            )
            call.resolve(o)
        }
    }

    @PluginMethod
    fun enableAutoUpdate(call: PluginCall) {
        BazaarAutoUpdater.enableAutoUpdate(activity ?: context)
        call.resolve()
    }

    override fun handleOnDestroy() {
        connection?.disconnect()
        connection = null
        connected = false
        try {
            BazaarSignIn.disconnect(context)
            BazaarStorage.disconnect(context)
        } catch (e: Exception) {
            // never connected
        }
        super.handleOnDestroy()
    }

    private companion object {
        const val BAZAAR_PACKAGE = "com.farsitel.bazaar"
    }
}
