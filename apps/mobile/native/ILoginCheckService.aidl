// Cafe Bazaar's login check (https://developers.cafebazaar.ir/fa/guidelines/feature/login-check).
// Copied into android/app/src/main/aidl/com/farsitel/bazaar/ by scripts/bazaar.mjs.
package com.farsitel.bazaar;
interface ILoginCheckService {
    boolean isLoggedIn();
}
