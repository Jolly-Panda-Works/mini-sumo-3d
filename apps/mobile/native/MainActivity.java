package __PACKAGE__;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugin: Google Play Games sign-in and cloud save.
        registerPlugin(PlayGamesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
