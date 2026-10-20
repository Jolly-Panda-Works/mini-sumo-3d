package __PACKAGE__

import androidx.activity.ComponentActivity
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import ir.cafebazaar.poolakey.Connection
import ir.cafebazaar.poolakey.Payment
import ir.cafebazaar.poolakey.config.PaymentConfiguration
import ir.cafebazaar.poolakey.config.SecurityCheck
import ir.cafebazaar.poolakey.entity.PurchaseInfo
import ir.cafebazaar.poolakey.request.PurchaseRequest

/**
 * Cafe Bazaar in-app billing (Poolakey) for the web game:
 * connect, purchase, consume and list unfinished purchases.
 * The RSA key comes from the bazaar_rsa_key string resource (added by scripts/bazaar.mjs);
 * Poolakey verifies every purchase's signature with it on the device.
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

    override fun handleOnDestroy() {
        connection?.disconnect()
        connection = null
        connected = false
        super.handleOnDestroy()
    }
}
