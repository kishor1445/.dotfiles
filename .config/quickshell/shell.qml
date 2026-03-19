import Quickshell
import Quickshell.Io
import "./components"

ShellRoot {
  id: root

  property bool showLauncher: false


  IpcHandler {
    target: "launcher"
    function toggle() {
      root.showLauncher = !root.showLauncher
    }
  }
}
