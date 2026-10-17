// Low-resolution, silent composition preview. Uses the same source filtering and
// drawing-surface composition as the recorder, without capturing presenter controls.
import Foundation
import CoreGraphics
import CoreMedia
import CoreImage
import ScreenCaptureKit
import Darwin

struct PreviewConfig: Decodable {
    let ownerPID: Int32
    let displayId: UInt32?
    let windowId: UInt32?
    let drawingId: UInt32?
    let showAppWindows: Bool?
    let board: Bool
    let aspect: Double?
}
final class StudioPreview: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "studio.preview", qos: .userInitiated)
    let context = CIContext(options: [.cacheIntermediates: false])
    let color = CGColorSpace(name: CGColorSpace.sRGB)!
    var primary: SCStream?
    var drawing: SCStream?
    var base: CIImage?
    var ink: CIImage?
    var sourceFrame = CGRect.zero
    var drawingFrame = CGRect.zero
    var canvas = CGRect.zero
    var settings: PreviewConfig!
    var lastSent: CFAbsoluteTime = 0

    private var shakeStart: CFAbsoluteTime = 0
    private var shakeDuration: Double = 0
    private var shakeStrength: Double = 0
    private func shaken(_ image: CIImage, canvas: CGRect) -> CIImage {
        let elapsed = CFAbsoluteTimeGetCurrent() - shakeStart
        guard elapsed >= 0, elapsed < shakeDuration else { return image }
        let fade = pow(1 - elapsed / shakeDuration, 2)
        let amplitude = shakeStrength * Double(canvas.height) / 1080
        let dx = sin(elapsed * 107) * amplitude * fade
        let dy = cos(elapsed * 139) * amplitude * fade * 0.65
        let scale = 1 + 2 * amplitude / Double(min(canvas.width, canvas.height))
        return image.transformed(by: CGAffineTransform(translationX: -canvas.midX, y: -canvas.midY))
            .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            .transformed(by: CGAffineTransform(translationX: canvas.midX + dx, y: canvas.midY + dy)).cropped(to: canvas)
    }

    private var shakeTimer: DispatchSourceTimer?
    func shake(strength: Double, durationMs: Double) {
        guard strength.isFinite, durationMs.isFinite else { return }
        queue.async {
            self.shakeStart = CFAbsoluteTimeGetCurrent(); self.shakeDuration = min(2000, max(100, durationMs)) / 1000; self.shakeStrength = min(24, max(1, strength))
            self.shakeTimer?.cancel()
            let timer = DispatchSource.makeTimerSource(queue: self.queue); self.shakeTimer = timer
            timer.schedule(deadline: .now(), repeating: 1.0 / 15)
            timer.setEventHandler { [weak self] in
                guard let self else { return }
                let finished = CFAbsoluteTimeGetCurrent() >= self.shakeStart + self.shakeDuration
                self.emitFrame(force: finished)
                if finished { self.shakeTimer?.cancel(); self.shakeTimer = nil }
            }
            timer.resume()
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("Live preview stopped.\n", stderr); exit(1)
    }
    func fit(_ image: CIImage, to target: CGRect) -> CIImage {
        let scale = min(target.width / image.extent.width, target.height / image.extent.height)
        return image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
            .transformed(by: CGAffineTransform(scaleX: scale, y: scale))
            .transformed(by: CGAffineTransform(translationX: target.midX - image.extent.width * scale / 2,
                                               y: target.midY - image.extent.height * scale / 2))
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sample.isValid, let buffer = sample.imageBuffer else { return }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
           let status = attachments.first?[.status] as? Int, status != SCFrameStatus.complete.rawValue { return }
        autoreleasepool {
            let image = CIImage(cvPixelBuffer: buffer)
            if stream === drawing { ink = image } else { base = image }
            emitFrame()
        }
    }
    func emitFrame(force: Bool = false) {
            guard let base, canvas.width > 0, force || CFAbsoluteTimeGetCurrent() - lastSent >= 1.0 / 15 else { return }
            let black = CIImage(color: .black).cropped(to: canvas)
            var result = fit(base, to: canvas).composited(over: black)
            if let ink, settings.windowId != nil, drawingFrame.width > 0 {
                if settings.board { result = fit(ink, to: canvas).composited(over: black) }
                else {
                    let sx = ink.extent.width / drawingFrame.width
                    let sy = ink.extent.height / drawingFrame.height
                    let crop = CGRect(x: (sourceFrame.minX - drawingFrame.minX) * sx,
                                      y: (drawingFrame.maxY - sourceFrame.maxY) * sy,
                                      width: sourceFrame.width * sx, height: sourceFrame.height * sy)
                    // Pad transparent pixels before cropping when the window extends offscreen.
                    let clear = CIImage(color: .clear).cropped(to: crop)
                    result = fit(ink.composited(over: clear).cropped(to: crop), to: canvas).composited(over: result)
                }
            }
            result = shaken(result, canvas: canvas)
            guard let data = context.jpegRepresentation(of: result.cropped(to: canvas), colorSpace: color,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.75]) else { return }
            lastSent = CFAbsoluteTimeGetCurrent()
            var length = UInt32(data.count).bigEndian
            FileHandle.standardOutput.write(Data(bytes: &length, count: 4))
            FileHandle.standardOutput.write(data)
    }

    func configuration(_ frame: CGRect, transparent: Bool = false) -> SCStreamConfiguration {
        let config = SCStreamConfiguration()
        let aspect = transparent ? frame.width / frame.height : (settings.aspect ?? frame.width / frame.height)
        config.width = min(1280, max(2, Int(frame.width)))
        config.height = max(2, Int(Double(config.width) / aspect))
        config.minimumFrameInterval = CMTime(value: 1, timescale: 15)
        config.queueDepth = 3
        config.showsCursor = false
        config.capturesAudio = false
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.scalesToFit = true
        config.preservesAspectRatio = true
        config.ignoreShadowsSingleWindow = true
        config.shouldBeOpaque = !transparent
        return config
    }
    func start(_ settings: PreviewConfig) async throws {
        self.settings = settings
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        let filter: SCContentFilter
        let surface = content.windows.first { $0.windowID == settings.drawingId && $0.owningApplication?.processID == settings.ownerPID }
        if let id = settings.windowId {
            guard let window = content.windows.first(where: { $0.windowID == id }), (settings.showAppWindows == true || window.owningApplication?.processID != settings.ownerPID) else {
                throw NSError(domain: "Preview", code: 1)
            }
            sourceFrame = window.frame
            filter = SCContentFilter(desktopIndependentWindow: window)
        } else {
            guard let display = content.displays.first(where: { $0.displayID == settings.displayId }),
                  let owner = content.applications.first(where: { $0.processID == settings.ownerPID }) else { throw NSError(domain: "Preview", code: 2) }
            sourceFrame = display.frame
            filter = SCContentFilter(display: display, excludingApplications: settings.showAppWindows == true ? [] : [owner], exceptingWindows: settings.showAppWindows == true ? [] : content.windows.filter { $0.owningApplication?.processID == settings.ownerPID && $0.windowID == settings.drawingId })
        }
        let config = configuration(sourceFrame)
        canvas = CGRect(x: 0, y: 0, width: config.width, height: config.height)
        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        primary = stream
        try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        if settings.windowId != nil, let surface {
            drawingFrame = surface.frame
            let overlay = SCStream(filter: SCContentFilter(desktopIndependentWindow: surface), configuration: configuration(surface.frame, transparent: true), delegate: self)
            drawing = overlay
            try overlay.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
            try await overlay.startCapture()
        }
        try await stream.startCapture()
        // Keep crops aligned if a captured window moves or resizes while the studio stays open.
        while true {
            try await Task.sleep(nanoseconds: 750_000_000)
            let current = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            if let id = settings.windowId {
                guard let window = current.windows.first(where: { $0.windowID == id }) else { throw NSError(domain: "Preview", code: 3) }
                let previous = queue.sync { sourceFrame }
                if previous != window.frame {
                    let next = configuration(window.frame)
                    try await stream.updateConfiguration(next)
                    queue.sync { sourceFrame = window.frame; canvas = CGRect(x: 0, y: 0, width: next.width, height: next.height) }
                }
            }
            if let overlay = drawing, let window = current.windows.first(where: { $0.windowID == settings.drawingId }), queue.sync(execute: { drawingFrame }) != window.frame {
                try await overlay.updateConfiguration(configuration(window.frame, transparent: true))
                queue.sync { drawingFrame = window.frame }
            }
        }
    }
}
let _ = CGMainDisplayID()
guard CommandLine.arguments.count == 2, let data = CommandLine.arguments[1].data(using: .utf8),
      let config = try? JSONDecoder().decode(PreviewConfig.self, from: data), CGPreflightScreenCaptureAccess() else { exit(1) }
let preview = StudioPreview()
Task { do { try await preview.start(config) } catch { fputs("Selected source is unavailable for live preview.\n", stderr); exit(1) } }
DispatchQueue.global().async {
    while let line = readLine() {
        let parts = line.split(separator: " ")
        if parts.count == 3, parts[0] == "shake", let strength = Double(parts[1]), let duration = Double(parts[2]) { preview.shake(strength: strength, durationMs: duration) }
    }
    exit(0)
}
dispatchMain()
