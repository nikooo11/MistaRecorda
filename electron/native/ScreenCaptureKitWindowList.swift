import Foundation
import CoreGraphics
import ScreenCaptureKit
import AppKit
import ApplicationServices

func focusFailure(_ code: String) -> Never {
	fputs("\(code)\n", stderr)
	exit(1)
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
	var value: CFTypeRef?
	guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
	return value
}

func windowFrame(_ window: AXUIElement) -> CGRect? {
	guard let position = attribute(window, kAXPositionAttribute), CFGetTypeID(position) == AXValueGetTypeID(),
		let size = attribute(window, kAXSizeAttribute), CFGetTypeID(size) == AXValueGetTypeID() else { return nil }
	var point = CGPoint.zero
	var dimensions = CGSize.zero
	guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
		AXValueGetValue(size as! AXValue, .cgSize, &dimensions) else { return nil }
	return CGRect(origin: point, size: dimensions)
}

func bringWindowToFront(_ id: CGWindowID) {
	guard AXIsProcessTrusted() else { focusFailure("ACCESSIBILITY_PERMISSION_REQUIRED") }
	guard let entries = CGWindowListCopyWindowInfo(.optionIncludingWindow, id) as? [[String: Any]],
		let entry = entries.first(where: { ($0[kCGWindowNumber as String] as? NSNumber)?.uint32Value == id }),
		let pid = entry[kCGWindowOwnerPID as String] as? Int32,
		let bounds = entry[kCGWindowBounds as String] as? [String: Any],
		let frame = CGRect(dictionaryRepresentation: bounds as CFDictionary),
		let running = NSRunningApplication(processIdentifier: pid) else { focusFailure("WINDOW_UNAVAILABLE") }
	let application = AXUIElementCreateApplication(pid)
	AXUIElementSetMessagingTimeout(application, 0.6)
	guard let windows = attribute(application, kAXWindowsAttribute) as? [AXUIElement] else { focusFailure("WINDOW_UNAVAILABLE") }
	// Public AX APIs do not expose CGWindowID. Match the resolved window within
	// its owning process using both its current geometry and title. Never pick
	// the first window of an app: multiple Chrome windows may share a title.
	let matches = windows.filter { window in
		guard let candidate = windowFrame(window) else { return false }
		return abs(candidate.minX - frame.minX) < 2 && abs(candidate.minY - frame.minY) < 2 &&
			abs(candidate.width - frame.width) < 2 && abs(candidate.height - frame.height) < 2
	}
	let title = entry[kCGWindowName as String] as? String ?? ""
	let titled = matches.filter { (attribute($0, kAXTitleAttribute) as? String) == title }
	let candidates = titled.isEmpty ? matches : titled
	guard candidates.count == 1, let window = candidates.first else { focusFailure("WINDOW_AMBIGUOUS_OR_UNAVAILABLE") }
	_ = AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
	_ = AXUIElementSetAttributeValue(window, kAXMainAttribute as CFString, kCFBooleanTrue)
	_ = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
	_ = running.unhide()
	guard running.activate(options: []) else { focusFailure("WINDOW_ACTIVATION_FAILED") }
	guard AXUIElementPerformAction(window, kAXRaiseAction as CFString) == .success else { focusFailure("WINDOW_RAISE_FAILED") }
	_ = AXUIElementSetAttributeValue(window, kAXFocusedAttribute as CFString, kCFBooleanTrue)
	// Activation is asynchronous. Confirm the selected window actually received
	// focus, without repeatedly activating it and fighting the user's input.
	for _ in 0..<10 {
		if running.isActive, let focused = attribute(application, kAXFocusedWindowAttribute), CFEqual(focused, window) {
			print("WINDOW_FOCUSED \(id)")
			return
		}
		RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
	}
	focusFailure("WINDOW_FOCUS_NOT_CONFIRMED")
}

if CommandLine.arguments.count > 1 {
	guard CommandLine.arguments.count == 3, CommandLine.arguments[1] == "--focus",
		let id = UInt32(CommandLine.arguments[2]), id > 0 else { focusFailure("INVALID_WINDOW_ID") }
	bringWindowToFront(id)
	exit(0)
}

struct WindowListEntry: Codable {
	let id: String
	let name: String
	let display_id: String
	let appName: String?
	let windowTitle: String?
	let bundleId: String?
	let x: Double
	let y: Double
	let width: Double
	let height: Double
}

func normalize(_ value: String?) -> String? {
	guard let rawValue = value?.trimmingCharacters(in: .whitespacesAndNewlines), !rawValue.isEmpty else {
		return nil
	}

	return rawValue
}

let excludedBundleIds: Set<String> = [
	"com.apple.controlcenter",
	"com.apple.dock",
	"com.apple.WindowManager",
	"com.apple.wallpaper.agent",
]

let excludedWindowTitles: Set<String> = [
	"Display 1 Backstop",
	"Event Shield Window",
	"Menubar",
	"Offscreen Wallpaper Window",
	"Wallpaper-",
]

// Force CoreGraphics Services initialization before asking ScreenCaptureKit for
// shareable content. Without this, the helper can stall sporadically when run
// as a standalone CLI process from Electron.
let _ = CGMainDisplayID()

// A background source refresh must not ask for access or return stale sources.
guard CGPreflightScreenCaptureAccess() else {
	fputs("SCREEN_RECORDING_PERMISSION_DENIED\n", stderr)
	exit(1)
}

let group = DispatchGroup()
group.enter()

Task {
	do {
		let shareableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)

		struct RawWindowEntry {
			let entry: WindowListEntry
			let hasRawTitle: Bool
			let bundleId: String?
		}

		let rawEntries = shareableContent.windows.compactMap { window -> RawWindowEntry? in
			let appName = normalize(window.owningApplication?.applicationName)
			let windowTitle = normalize(window.title)
			let bundleId = normalize(window.owningApplication?.bundleIdentifier)
			let frame = window.frame

			guard window.windowLayer == 0 else {
				return nil
			}

			guard frame.width >= 50, frame.height >= 50 else {
				return nil
			}

			guard appName != nil || windowTitle != nil else {
				return nil
			}

			if let bundleId, excludedBundleIds.contains(bundleId) {
				return nil
			}

			if let windowTitle, excludedWindowTitles.contains(windowTitle) {
				return nil
			}

			let matchedDisplay = shareableContent.displays.first(where: { display in
				display.frame.intersects(frame) || display.frame.contains(CGPoint(x: frame.midX, y: frame.midY))
			})

			let resolvedWindowTitle = windowTitle ?? appName ?? "Window"
			let resolvedName: String
			if let appName, let windowTitle {
				resolvedName = "\(appName) — \(windowTitle)"
			} else {
				resolvedName = resolvedWindowTitle
			}

			let entry = WindowListEntry(
				id: "window:\(window.windowID):0",
				name: resolvedName,
				display_id: matchedDisplay.map { String($0.displayID) } ?? "",
				appName: appName,
				windowTitle: resolvedWindowTitle,
				bundleId: bundleId,
				x: Double(frame.origin.x),
				y: Double(frame.origin.y),
				width: Double(frame.width),
				height: Double(frame.height)
			)

			return RawWindowEntry(entry: entry, hasRawTitle: windowTitle != nil, bundleId: bundleId)
		}

		// For apps with multiple windows, drop auxiliary windows that lack a
		// distinct title (e.g. Arc's sidebar/tab-bar chrome). If ALL windows
		// from an app lack titles, keep them all.
		var titledCountByBundle: [String: Int] = [:]
		for raw in rawEntries {
			if let bid = raw.bundleId, raw.hasRawTitle {
				titledCountByBundle[bid, default: 0] += 1
			}
		}

		let entries = rawEntries
			.filter { raw in
				guard let bid = raw.bundleId else { return true }
				if let titled = titledCountByBundle[bid], titled > 0 {
					return raw.hasRawTitle
				}
				return true
			}
			.map { $0.entry }
		.sorted { lhs, rhs in
			let lhsApp = lhs.appName ?? lhs.name
			let rhsApp = rhs.appName ?? rhs.name
			if lhsApp != rhsApp {
				return lhsApp.localizedCaseInsensitiveCompare(rhsApp) == .orderedAscending
			}

			return (lhs.windowTitle ?? lhs.name).localizedCaseInsensitiveCompare(rhs.windowTitle ?? rhs.name) == .orderedAscending
		}

		let encoder = JSONEncoder()
		encoder.outputFormatting = [.sortedKeys]
		let data = try encoder.encode(entries)
		FileHandle.standardOutput.write(data)
	} catch {
		fputs("Error listing windows: \(error.localizedDescription)\n", stderr)
		fflush(stderr)
		exit(1)
	}

	group.leave()
}

group.wait()
