import ExpoModulesCore
import UIKit

// Streams the hinge of a foldable iPhone (iOS 27.1 UIHingeInteraction) to JS so the
// book on screen can open at the same angle as the device.
public class FolioHingeModule: Module {
  private var interaction: UIInteraction?
  private weak var host: UIView?

  public func definition() -> ModuleDefinition {
    Name("FolioHinge")

    Events("onHinge")

    Function("isSupported") { () -> Bool in
      if #available(iOS 27.1, *) { return true }
      return false
    }

    OnStartObserving {
      DispatchQueue.main.async { self.attach(attempt: 0) }
    }

    OnStopObserving {
      DispatchQueue.main.async { self.detach() }
    }

    OnDestroy {
      DispatchQueue.main.async { self.detach() }
    }
  }

  @MainActor
  private func attach(attempt: Int) {
    guard #available(iOS 27.1, *) else { return }
    if interaction != nil && host != nil { return }
    // The window that held the interaction is gone (e.g. the scene was rebuilt): start over.
    interaction = nil
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    let window = windows.first { $0.isKeyWindow } ?? windows.first
    guard let window else {
      // The scene may not have a window yet during launch.
      if attempt < 40 {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { self.attach(attempt: attempt + 1) }
      }
      return
    }
    let hinge = UIHingeInteraction { [weak self] _, update in
      guard let self else { return }
      guard let h = update.hinge else {
        self.sendEvent("onHinge", ["available": false, "angle": 0.0, "status": "unknown"])
        return
      }
      self.sendEvent("onHinge", [
        "available": true,
        "angle": Double(h.angle),
        "status": Self.name(h.status),
      ])
    }
    window.addInteraction(hinge)
    interaction = hinge
    host = window
  }

  @MainActor
  private func detach() {
    if let interaction, let host { host.removeInteraction(interaction) }
    interaction = nil
    host = nil
  }

  @available(iOS 27.1, *)
  private static func name(_ s: UIHinge.Status) -> String {
    switch s {
    case .closed: return "closed"
    case .partiallyOpen: return "partiallyOpen"
    case .fullyOpen: return "fullyOpen"
    default: return "unknown"
    }
  }
}
