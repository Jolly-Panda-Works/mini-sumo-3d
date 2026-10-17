package __PACKAGE__;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

/** Cafe Bazaar build: registers the in-app billing plugin. */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BazaarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
