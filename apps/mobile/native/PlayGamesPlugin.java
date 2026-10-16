package __PACKAGE__;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.SnapshotsClient;
import com.google.android.gms.games.snapshot.Snapshot;
import com.google.android.gms.games.snapshot.SnapshotMetadataChange;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Google Play Games Services v2 for Mini Sumo: sign-in and one cloud save ("Saved Games"),
 * stored by Google for the player's account. No game server involved.
 * Copied into the generated Android project by scripts/play-games.mjs.
 */
@CapacitorPlugin(name = "PlayGames")
public class PlayGamesPlugin extends Plugin {
    private static final String SAVE_NAME = "mini-sumo-progress";

    @Override
    public void load() {
        PlayGamesSdk.initialize(getContext());
    }

    @PluginMethod
    public void isAuthenticated(PluginCall call) {
        PlayGames.getGamesSignInClient(getActivity())
            .isAuthenticated()
            .addOnCompleteListener(task -> respond(call, task.isSuccessful() && task.getResult().isAuthenticated()));
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        PlayGames.getGamesSignInClient(getActivity())
            .signIn()
            .addOnCompleteListener(task -> respond(call, task.isSuccessful() && task.getResult().isAuthenticated()));
    }

    private void respond(PluginCall call, boolean authenticated) {
        if (!authenticated) {
            JSObject result = new JSObject();
            result.put("authenticated", false);
            call.resolve(result);
            return;
        }
        PlayGames.getPlayersClient(getActivity())
            .getCurrentPlayer()
            .addOnCompleteListener(task -> {
                JSObject result = new JSObject();
                result.put("authenticated", true);
                if (task.isSuccessful() && task.getResult() != null) {
                    result.put("name", task.getResult().getDisplayName());
                }
                call.resolve(result);
            });
    }

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String description = call.getString("description", "Mini Sumo progress");
        if (data == null) {
            call.reject("Nothing to save");
            return;
        }
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client
            .open(SAVE_NAME, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult().isConflict()) {
                    call.reject("Could not open the saved game");
                    return;
                }
                Snapshot snapshot = task.getResult().getData();
                snapshot.getSnapshotContents().writeBytes(data.getBytes(StandardCharsets.UTF_8));
                SnapshotMetadataChange change = new SnapshotMetadataChange.Builder().setDescription(description).build();
                client.commitAndClose(snapshot, change).addOnCompleteListener(done -> {
                    if (done.isSuccessful()) call.resolve();
                    else call.reject("Could not save the game");
                });
            });
    }

    @PluginMethod
    public void load(PluginCall call) {
        SnapshotsClient client = PlayGames.getSnapshotsClient(getActivity());
        client
            .open(SAVE_NAME, true, SnapshotsClient.RESOLUTION_POLICY_MOST_RECENTLY_MODIFIED)
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult().isConflict()) {
                    call.reject("Could not open the saved game");
                    return;
                }
                Snapshot snapshot = task.getResult().getData();
                JSObject result = new JSObject();
                try {
                    byte[] bytes = snapshot.getSnapshotContents().readFully();
                    String text = bytes.length == 0 ? "" : new String(bytes, StandardCharsets.UTF_8);
                    result.put("data", text);
                } catch (IOException e) {
                    client.discardAndClose(snapshot);
                    call.reject("Could not read the saved game");
                    return;
                }
                client.discardAndClose(snapshot);
                call.resolve(result);
            });
    }
}
