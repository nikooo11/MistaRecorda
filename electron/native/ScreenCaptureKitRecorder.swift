// Presenter notes and private PDF/reference previews are never captured.
private func isPrivatePresenterWindow(_ window: SCWindow, ownerPID: Int32?) -> Bool {
    return window.owningApplication?.processID == ownerPID &&
        ["MistaRecorda Board Editor", "MistaRecorda Board Stream", "MistaRecorda Vertical Guide"].contains(window.title ?? "")
}
import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreGraphics
import CoreImage

struct CaptureRegion: Codable { let x: Double; let y: Double; let width: Double; let height: Double }
struct CaptureConfig: Codable {
 let captureRegion: CaptureRegion?
	let fps: Int?
	let displayId: CGDirectDisplayID?
	let windowId: UInt32?
	let outputPath: String?
	let capturesSystemAudio: Bool?
	let capturesMicrophone: Bool?
	let systemAudioOutputPath: String?
	let microphoneDeviceId: String?
	let microphoneLabel: String?
	let microphoneOutputPath: String?
	let zoomOverlayOwnerPID: Int32?
	let zoomOverlayTitle: String?
	let presenterWindowTitles: [String]?
	let cleanSurfaceTitle: String?
 let cleanSurfaceWindowId: UInt32?
 let drawingMode: String?
 let showAppWindows: Bool?
}

let targetCaptureFPS = 60
let maxInlineAudioTailExtension = CMTime(seconds: 2.0, preferredTimescale: 600)

final class ScreenCaptureRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
	private let queue = DispatchQueue(label: "recordly.screencapturekit.video")
	private var assetWriter: AVAssetWriter?
	private var videoInput: AVAssetWriterInput?
	private var systemAudioWriter: AVAssetWriter?
	private var systemAudioInput: AVAssetWriterInput?
	private var microphoneOnlyWriter: AVAssetWriter?
	private var microphoneOnlyInput: AVAssetWriterInput?
	private var stream: SCStream?
	private var firstSampleTime: CMTime = .zero
	private var firstSystemAudioSampleTime: CMTime?
	private var firstMicrophoneSampleTime: CMTime?
	private var lastSampleBuffer: CMSampleBuffer?
	private var lastVideoPresentationTime: CMTime = .zero
	private var lastVideoDuration: CMTime = .zero
	private var lastInlineAudioPresentationTime: CMTime = .invalid
	private var lastInlineAudioDuration: CMTime = .zero
	private var isRecording = false
	private var isPaused = false
	private var pauseStartedHostTime: CMTime?
	private var pendingResumeAdjustment = false
	private var accumulatedPausedDuration: CMTime = .zero
	private var sessionStarted = false
	private var frameCount = 0
	private var outputURL: URL?
	private var microphoneOutputURL: URL?
	private var trackedWindowId: UInt32?
 private var captureSettings: CaptureConfig?
 private var currentDisplayId: UInt32?
 private var showAppWindows = false
 private var currentDrawingId: UInt32?
	private var windowValidationTask: Task<Void, Never>?
	private var inlineAudioInput: AVAssetWriterInput?
	private var firstInlineAudioSampleTime: CMTime?
	private var capturesSystemAudio = false
	private var capturesMicrophone = false
	private var microphoneAudible = true
	private var systemAudioAudible = true
	private var writesSystemAudioToSeparateTrack = false
	private var writesMicrophoneToSeparateTrack = false

	private var soundPlayers: [String: AVAudioPlayer] = [:]
	private var drawingStream: SCStream?
	private var drawingFrame: CGRect = .zero
	private var windowFrame: CGRect = .zero
	private var drawingIsBoard = false
	private var drawingImage: CIImage?
	private var windowImage: CIImage?
	private var outputSize: CGSize = .zero
	private var compositePool: CVPixelBufferPool?
	private let imageContext = CIContext(options: [.cacheIntermediates: false])

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
            guard self.isRecording, !self.isPaused else { return }
            self.shakeStart = CFAbsoluteTimeGetCurrent()
            self.shakeDuration = min(2000, max(100, durationMs)) / 1000
            self.shakeStrength = min(24, max(1, strength))
            self.shakeTimer?.cancel()
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            self.shakeTimer = timer
            timer.schedule(deadline: .now(), repeating: 1.0 / Double(targetCaptureFPS))
            timer.setEventHandler { [weak self] in
                guard let self else { return }
                let finished = CFAbsoluteTimeGetCurrent() >= self.shakeStart + self.shakeDuration
                defer { if !self.isRecording || self.isPaused { self.shakeTimer?.cancel(); self.shakeTimer = nil } }
                guard self.isRecording, !self.isPaused, self.sessionStarted,
                      let source = self.lastSampleBuffer, let input = self.videoInput, input.isReadyForMoreMediaData else { return }
                let time = CMClockGetTime(CMClockGetHostTimeClock()) - self.firstSampleTime - self.accumulatedPausedDuration
                guard time > self.lastVideoPresentationTime else { return }
                // A static desktop may stop delivering frames. Drive the short effect on this queue.
                guard let frame = self.compositedSample(source, force: true),
                      let timed = try? CMSampleBuffer(copying: frame, withNewTiming: [CMSampleTimingInfo(duration: CMTime(value: 1, timescale: CMTimeScale(targetCaptureFPS)), presentationTimeStamp: time, decodeTimeStamp: .invalid)]) else { return }
                if input.append(timed) {
                    self.lastSampleBuffer = frame; self.lastVideoPresentationTime = time
                    self.lastVideoDuration = CMTime(value: 1, timescale: CMTimeScale(targetCaptureFPS)); self.frameCount += 1
                    if finished { self.shakeTimer?.cancel(); self.shakeTimer = nil }
                }
            }
            timer.resume()
        }
    }

	func playSound(_ encoded: String) {
		struct Sound: Decodable { let token: String; let path: String; let volume: Float }
		guard let data = Data(base64Encoded: encoded), let sound = try? JSONDecoder().decode(Sound.self, from: data) else { return }
		queue.async {
			do {
				guard self.isRecording, !self.isPaused else { throw NSError(domain: "Sound", code: 1) }
				let player = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: sound.path))
				player.volume = min(2, max(0, sound.volume))
				self.soundPlayers = self.soundPlayers.filter { $0.value.isPlaying }
				self.soundPlayers[sound.token] = player
				guard player.play() else { throw NSError(domain: "Sound", code: 2) }
				print("SOUND_PLAYING \(sound.token)"); fflush(stdout)
			} catch { print("SOUND_FAILED \(sound.token)"); fflush(stdout) }
		}
	}

	func setDrawing(windowID: UInt32, board: Bool) async throws {
		currentDrawingId = windowID
        drawingIsBoard = board
        guard trackedWindowId != nil else { return } // Display capture already includes the clean surface.
		if drawingStream == nil {
			var window: SCWindow?
			// WindowServer can expose a newly created transparent window before its
			// geometry settles. Configuring a 2x2 stream here permanently blurs the board.
			for attempt in 0..<20 {
				let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
				if let candidate = content.windows.first(where: { $0.windowID == windowID }),
					candidate.frame.width >= 2, candidate.frame.height >= 2 {
					window = candidate
					break
				}
				if attempt < 19 { try await Task.sleep(nanoseconds: 50_000_000) }
			}
			guard let window else { throw NSError(domain: "Drawing", code: 1, userInfo: [NSLocalizedDescriptionKey: "Drawing window is not ready for capture."]) }
			let config = SCStreamConfiguration()
			config.width = max(2, Int(window.frame.width) * 2)
			config.height = max(2, Int(window.frame.height) * 2)
			config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
			config.queueDepth = 3
			config.showsCursor = false
			config.shouldBeOpaque = false
			config.pixelFormat = kCVPixelFormatType_32BGRA
			config.ignoreShadowsSingleWindow = true
			fputs("Drawing capture window \(window.windowID): \(config.width)x\(config.height), frame \(window.frame)\n", stderr)
			let overlay = SCStream(filter: SCContentFilter(desktopIndependentWindow: window), configuration: config, delegate: self)
			try overlay.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
			await withCheckedContinuation { continuation in
				queue.async { self.drawingFrame = window.frame; self.drawingStream = overlay; continuation.resume() }
			}
			try await overlay.startCapture()
		}
		await withCheckedContinuation { continuation in
			queue.async { self.drawingIsBoard = board; continuation.resume() }
		}
	}

	private func compositedSample(_ source: CMSampleBuffer, force: Bool = false) -> CMSampleBuffer? {
		guard let base = windowImage, let pool = compositePool else { return nil }
		let shaking = CFAbsoluteTimeGetCurrent() < shakeStart + shakeDuration
		guard drawingImage != nil || shaking || force else { return nil }
		let canvas = CGRect(origin: .zero, size: outputSize)
		var combined = base
		if let overlay = drawingImage, drawingStream != nil {
		let crop: CGRect
		if drawingIsBoard { crop = overlay.extent }
		else {
			let sx = overlay.extent.width / drawingFrame.width
			let sy = overlay.extent.height / drawingFrame.height
			crop = CGRect(x: (windowFrame.minX - drawingFrame.minX) * sx,
				y: (drawingFrame.maxY - windowFrame.maxY) * sy, width: windowFrame.width * sx, height: windowFrame.height * sy)
		}
		guard crop.width > 0, crop.height > 0 else { return nil }
		let scale = min(canvas.width / crop.width, canvas.height / crop.height)
		let x = (canvas.width - crop.width * scale) / 2, y = (canvas.height - crop.height * scale) / 2
		let ink = overlay.cropped(to: crop).transformed(by: CGAffineTransform(translationX: -crop.minX, y: -crop.minY))
			.transformed(by: CGAffineTransform(scaleX: scale, y: scale)).transformed(by: CGAffineTransform(translationX: x, y: y))
		let background = drawingIsBoard ? CIImage(color: .black).cropped(to: canvas) : base
		combined = ink.composited(over: background).cropped(to: canvas)
		}
		combined = shaken(combined, canvas: canvas)
		var pixel: CVPixelBuffer?
		guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pixel) == kCVReturnSuccess, let pixel else { return nil }
		imageContext.render(combined, to: pixel, bounds: canvas, colorSpace: CGColorSpaceCreateDeviceRGB())
		var format: CMVideoFormatDescription?
		guard CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixel, formatDescriptionOut: &format) == noErr, let format else { return nil }
		var timing = CMSampleTimingInfo(duration: source.duration, presentationTimeStamp: source.presentationTimeStamp, decodeTimeStamp: .invalid)
		var sample: CMSampleBuffer?
		CMSampleBufferCreateReadyWithImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: pixel, formatDescription: format, sampleTiming: &timing, sampleBufferOut: &sample)
		return sample
	}

	private let microphoneOutputTypeRawValue = 2

	func startCapture(configJSON: String) async throws {
		guard !isRecording else {
			throw NSError(domain: "RecordlyCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "Recording is already in progress"])
		}

		guard let data = configJSON.data(using: .utf8) else {
			throw NSError(domain: "RecordlyCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "Invalid JSON input"])
		}

		let config = try JSONDecoder().decode(CaptureConfig.self, from: data)
        captureSettings = config
        showAppWindows = config.showAppWindows ?? false
        currentDrawingId = config.cleanSurfaceWindowId
        currentDisplayId = config.windowId == nil ? (config.displayId ?? CGMainDisplayID()) : nil
		// Include the pre-created, hidden target outline so it can be excluded before any frame is captured.
		var availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        // WindowServer may publish a newly shown transparent window a little later
        // than its first renderer frame. Refresh before constructing the filter.
        func isCleanSurface(_ window: SCWindow) -> Bool {
            guard window.owningApplication?.processID == config.zoomOverlayOwnerPID else { return false }
            if let id = config.cleanSurfaceWindowId { return window.windowID == id }
            return config.cleanSurfaceTitle != nil && window.title == config.cleanSurfaceTitle
        }
        if config.windowId == nil && (config.cleanSurfaceWindowId != nil || config.cleanSurfaceTitle != nil) {
            for _ in 0..<20 {
                if availableContent.windows.contains(where: isCleanSurface) { break }
                try await Task.sleep(nanoseconds: 100_000_000)
                availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
            }
        }
		let zoomOverlays = availableContent.windows.filter {
			config.zoomOverlayOwnerPID != nil && $0.owningApplication?.processID == config.zoomOverlayOwnerPID &&
			((config.zoomOverlayTitle != nil && $0.title == config.zoomOverlayTitle) || (config.presenterWindowTitles ?? []).contains($0.title ?? ""))
		}
		let streamConfig = SCStreamConfiguration()
		capturesSystemAudio = config.capturesSystemAudio ?? false
		capturesMicrophone = config.capturesMicrophone ?? false
		if capturesMicrophone && !supportsNativeMicrophoneCapture(streamConfig: streamConfig) {
			fputs("MICROPHONE_CAPTURE_UNAVAILABLE\n", stderr)
			fflush(stderr)
			capturesMicrophone = false
		}
		writesSystemAudioToSeparateTrack = capturesSystemAudio
		// Keep an isolated mic track even for mic-only takes, so voice conversion
		// never has to infer whether embedded video audio contains system sound.
		writesMicrophoneToSeparateTrack = capturesMicrophone
		let requestedFPS = max(targetCaptureFPS, config.fps ?? targetCaptureFPS)
		streamConfig.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(requestedFPS))
		streamConfig.queueDepth = 6
		streamConfig.pixelFormat = kCVPixelFormatType_32BGRA
		streamConfig.showsCursor = false
		streamConfig.scalesToFit = true
		if #available(macOS 14.0, *) { streamConfig.preservesAspectRatio = true }
		streamConfig.capturesAudio = capturesSystemAudio || capturesMicrophone
		streamConfig.sampleRate = 48000
		streamConfig.channelCount = 2
		streamConfig.excludesCurrentProcessAudio = true

		if capturesMicrophone {
			streamConfig.setValue(true, forKey: "captureMicrophone")
			if let microphoneDeviceId = Self.resolveMicrophoneCaptureDeviceID(config: config) {
				streamConfig.setValue(microphoneDeviceId, forKey: "microphoneCaptureDeviceID")
			}
		}

		let filter: SCContentFilter
		let outputWidth: Int
		let outputHeight: Int

		if let windowId = config.windowId {
			trackedWindowId = windowId
			guard let window = availableContent.windows.first(where: { $0.windowID == windowId }), !isPrivatePresenterWindow(window, ownerPID: config.zoomOverlayOwnerPID) else {
				throw NSError(domain: "RecordlyCapture", code: 3, userInfo: [NSLocalizedDescriptionKey: "Window not found"])
			}

			windowFrame = window.frame
			filter = SCContentFilter(desktopIndependentWindow: window)

			let candidateDisplay = availableContent.displays.first(where: {
				$0.frame.intersects(window.frame) || $0.frame.contains(CGPoint(x: window.frame.midX, y: window.frame.midY))
			})
			let scaleFactor = ScreenCaptureRecorder.scaleFactor(for: candidateDisplay?.displayID ?? CGMainDisplayID())
			outputWidth = max(2, Int(window.frame.width) * scaleFactor)
			outputHeight = max(2, Int(window.frame.height) * scaleFactor)
			if #available(macOS 14.0, *) {
				streamConfig.ignoreShadowsSingleWindow = true
			}
			streamConfig.width = outputWidth
			streamConfig.height = outputHeight
		} else {
			trackedWindowId = nil
			let displayId = config.displayId ?? CGMainDisplayID()
			guard let display = availableContent.displays.first(where: { $0.displayID == displayId }) else {
				throw NSError(domain: "RecordlyCapture", code: 4, userInfo: [NSLocalizedDescriptionKey: "Display not found"])
			}

			if let ownerPID = config.zoomOverlayOwnerPID,
               let owner = availableContent.applications.first(where: { $0.processID == ownerPID }) {
                var included: [SCWindow] = []
                if config.cleanSurfaceWindowId != nil || config.cleanSurfaceTitle != nil {
                    guard let cleanSurface = availableContent.windows.first(where: isCleanSurface) else {
                        throw NSError(domain: "RecordlyCapture", code: 7, userInfo: [NSLocalizedDescriptionKey: "macOS could not register the drawing window after recovery. Your drawing is saved; recording has not started."])
                    }
                    included = [cleanSurface]
                }
                // An empty app exclusion also includes app windows opened after capture starts.
                filter = showAppWindows ? SCContentFilter(display: display, excludingWindows: availableContent.windows.filter { isPrivatePresenterWindow($0, ownerPID: owner.processID) }) : SCContentFilter(display: display, excludingApplications: [owner], exceptingWindows: included)
            } else {
                throw NSError(domain: "RecordlyCapture", code: 10, userInfo: [NSLocalizedDescriptionKey: "Could not exclude recorder controls. Reopen MistaRecorda and try again."])
            }
			let displayBounds = CGDisplayBounds(display.displayID)
			let scaleFactor = ScreenCaptureRecorder.scaleFactor(for: display.displayID)
			if let region = config.captureRegion {
                let rect = CGRect(x: region.x, y: region.y, width: region.width, height: region.height)
                guard rect.width.isFinite, rect.height.isFinite, rect.width > 0, rect.height > 0,
                      CGRect(origin: .zero, size: displayBounds.size).contains(rect), abs(rect.width / rect.height - 9.0/16.0) < 0.001 else { throw NSError(domain: "Vertical", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid vertical capture frame."]) }
                streamConfig.sourceRect = rect
                outputWidth = 1080; outputHeight = 1920
            } else {
                outputWidth = max(2, Int(displayBounds.width) * scaleFactor)
                outputHeight = max(2, Int(displayBounds.height) * scaleFactor)
            }
			streamConfig.width = outputWidth
			streamConfig.height = outputHeight
		}

		outputSize = CGSize(width: outputWidth, height: outputHeight)
		CVPixelBufferPoolCreate(nil, nil, [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey: outputWidth, kCVPixelBufferHeightKey: outputHeight, kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &compositePool)
		// Older helpers or a missing exclusion never authorize the app to show an outline.
		if config.windowId != nil || availableContent.applications.contains(where: { $0.processID == config.zoomOverlayOwnerPID }) || zoomOverlays.contains(where: { config.zoomOverlayTitle != nil && $0.title == config.zoomOverlayTitle }) {
			print("ZOOM_OVERLAY_EXCLUDED")
			fflush(stdout)
		}
		let destinationURL: URL
		if let outputPath = config.outputPath, !outputPath.isEmpty {
			destinationURL = URL(fileURLWithPath: outputPath)
		} else {
			destinationURL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
				.appendingPathComponent("output_\(Int(Date().timeIntervalSince1970)).mp4")
		}

		outputURL = destinationURL
		let outputFileType: AVFileType = destinationURL.pathExtension.lowercased() == "mp4" ? .mp4 : .mov
		assetWriter = try AVAssetWriter(url: destinationURL, fileType: outputFileType)
		microphoneOutputURL = nil
		firstSystemAudioSampleTime = nil
		firstMicrophoneSampleTime = nil

		guard let assistant = AVOutputSettingsAssistant(preset: .preset3840x2160) else {
			throw NSError(domain: "RecordlyCapture", code: 5, userInfo: [NSLocalizedDescriptionKey: "Unable to create output settings assistant"])
		}

		assistant.sourceVideoFormat = try CMVideoFormatDescription(
			videoCodecType: .h264,
			width: outputWidth,
			height: outputHeight
		)

		guard var outputSettings = assistant.videoSettings else {
			throw NSError(domain: "RecordlyCapture", code: 6, userInfo: [NSLocalizedDescriptionKey: "Output settings unavailable"])
		}

		outputSettings[AVVideoWidthKey] = outputWidth
		outputSettings[AVVideoHeightKey] = outputHeight

		let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: outputSettings)
		videoInput.expectsMediaDataInRealTime = true

		guard let assetWriter = assetWriter, assetWriter.canAdd(videoInput) else {
			throw NSError(domain: "RecordlyCapture", code: 7, userInfo: [NSLocalizedDescriptionKey: "Unable to add video writer input"])
		}

		assetWriter.add(videoInput)
		self.videoInput = videoInput

		// Add inline audio track directly to the video so the .mp4 always contains audio.
		// This eliminates the dependency on the post-recording ffmpeg mux step.
		if capturesSystemAudio || capturesMicrophone {
			let inlineAudio = AVAssetWriterInput(mediaType: .audio, outputSettings: Self.audioOutputSettings(bitRate: 192_000))
			inlineAudio.expectsMediaDataInRealTime = true
			if assetWriter.canAdd(inlineAudio) {
				assetWriter.add(inlineAudio)
				self.inlineAudioInput = inlineAudio
			}
		}

		if writesSystemAudioToSeparateTrack {
			guard let systemAudioOutputPath = config.systemAudioOutputPath, !systemAudioOutputPath.isEmpty else {
				throw NSError(domain: "RecordlyCapture", code: 11, userInfo: [NSLocalizedDescriptionKey: "Missing system audio output path for audio capture"])
			}

			let systemAudioURL = URL(fileURLWithPath: systemAudioOutputPath)
			let systemAudioWriter = try AVAssetWriter(url: systemAudioURL, fileType: .m4a)
			let systemAudioInput = AVAssetWriterInput(mediaType: .audio, outputSettings: Self.audioOutputSettings(bitRate: 160_000))
			systemAudioInput.expectsMediaDataInRealTime = true

			guard systemAudioWriter.canAdd(systemAudioInput) else {
				throw NSError(domain: "RecordlyCapture", code: 12, userInfo: [NSLocalizedDescriptionKey: "Unable to add system audio writer input"])
			}

			systemAudioWriter.add(systemAudioInput)
			self.systemAudioWriter = systemAudioWriter
			self.systemAudioInput = systemAudioInput

			guard systemAudioWriter.startWriting() else {
				throw NSError(domain: "RecordlyCapture", code: 13, userInfo: [NSLocalizedDescriptionKey: systemAudioWriter.error?.localizedDescription ?? "Unable to start system audio writing"])
			}

			systemAudioWriter.startSession(atSourceTime: .zero)
		}

		if writesMicrophoneToSeparateTrack {
			guard let microphoneOutputPath = config.microphoneOutputPath, !microphoneOutputPath.isEmpty else {
				throw NSError(domain: "RecordlyCapture", code: 14, userInfo: [NSLocalizedDescriptionKey: "Missing microphone output path for microphone capture"])
			}

			let microphoneURL = URL(fileURLWithPath: microphoneOutputPath)
			microphoneOutputURL = microphoneURL
			let microphoneWriter = try AVAssetWriter(url: microphoneURL, fileType: .m4a)
			let microphoneInput = AVAssetWriterInput(mediaType: .audio, outputSettings: Self.audioOutputSettings(bitRate: 128_000))
			microphoneInput.expectsMediaDataInRealTime = true

			guard microphoneWriter.canAdd(microphoneInput) else {
				throw NSError(domain: "RecordlyCapture", code: 15, userInfo: [NSLocalizedDescriptionKey: "Unable to add microphone writer input"])
			}

			microphoneWriter.add(microphoneInput)
			self.microphoneOnlyWriter = microphoneWriter
			self.microphoneOnlyInput = microphoneInput

			guard microphoneWriter.startWriting() else {
				throw NSError(domain: "RecordlyCapture", code: 16, userInfo: [NSLocalizedDescriptionKey: microphoneWriter.error?.localizedDescription ?? "Unable to start microphone audio writing"])
			}

			microphoneWriter.startSession(atSourceTime: .zero)
		}

		let stream = SCStream(filter: filter, configuration: streamConfig, delegate: self)
		self.stream = stream
		try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
		if capturesSystemAudio {
			try stream.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
		}
		if capturesMicrophone {
			guard let microphoneOutputType = SCStreamOutputType(rawValue: microphoneOutputTypeRawValue) else {
				throw NSError(
					domain: "RecordlyCapture",
					code: 17,
					userInfo: [NSLocalizedDescriptionKey: "Microphone stream output type is unavailable"]
				)
			}
			try stream.addStreamOutput(self, type: microphoneOutputType, sampleHandlerQueue: queue)
		}
		try await stream.startCapture()

		guard assetWriter.startWriting() else {
			throw NSError(domain: "RecordlyCapture", code: 8, userInfo: [NSLocalizedDescriptionKey: assetWriter.error?.localizedDescription ?? "Unable to start video writing"])
		}

		assetWriter.startSession(atSourceTime: .zero)
		sessionStarted = true
		isRecording = true
		isPaused = false
		pauseStartedHostTime = nil
		pendingResumeAdjustment = false
		accumulatedPausedDuration = .zero
		frameCount = 0
		firstSampleTime = .zero
		lastVideoPresentationTime = .zero
		lastVideoDuration = .zero
		if config.windowId != nil, let surfaceID = config.cleanSurfaceWindowId {
			try await setDrawing(windowID: surfaceID, board: config.drawingMode == "board")
		}
		startWindowValidationIfNeeded()
		print("Recording started")
		fflush(stdout)
	}

	func stopCapture() async throws -> String {
		guard isRecording else {
			throw NSError(domain: "RecordlyCapture", code: 9, userInfo: [NSLocalizedDescriptionKey: "No recording in progress"])
		}

		return try await finishCapture()
	}

	func switchWindow(_ windowID: UInt32) async throws {
        guard captureSettings?.captureRegion == nil else { throw NSError(domain: "Vertical", code: 2, userInfo: [NSLocalizedDescriptionKey: "Keep the framed screen selected during vertical recording."]) }
		guard isRecording, let stream else {
			throw NSError(domain: "RecordlyCapture", code: 8, userInfo: [NSLocalizedDescriptionKey: "Window capture is not active"])
		}
		let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
		guard let window = content.windows.first(where: { $0.windowID == windowID }), !isPrivatePresenterWindow(window, ownerPID: captureSettings?.zoomOverlayOwnerPID) else {
			throw NSError(domain: "RecordlyCapture", code: 9, userInfo: [NSLocalizedDescriptionKey: "Window unavailable"])
		}
		// Keep the writer, frame size, audio and media clock alive across source changes.
		try await stream.updateContentFilter(SCContentFilter(desktopIndependentWindow: window))
		trackedWindowId = windowID
        currentDisplayId = nil
        if let id = currentDrawingId { try await setDrawing(windowID: id, board: drawingIsBoard) }
		queue.async { self.windowFrame = window.frame; self.windowImage = nil }
		startWindowValidationIfNeeded()
		print("SOURCE_SWITCHED \(windowID)")
		fflush(stdout)
	}

    func switchDisplay(_ displayID: UInt32) async throws {
        if captureSettings?.captureRegion != nil && displayID != captureSettings?.displayId { throw NSError(domain: "Vertical", code: 3) }
        guard isRecording, let stream, let settings = captureSettings else { throw NSError(domain: "Capture", code: 1) }
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first(where: { $0.displayID == displayID }),
              let owner = content.applications.first(where: { $0.processID == settings.zoomOverlayOwnerPID }) else { throw NSError(domain: "Capture", code: 2) }
        let included = content.windows.filter { $0.owningApplication?.processID == owner.processID && $0.windowID == currentDrawingId }
        try await stream.updateContentFilter(showAppWindows ? SCContentFilter(display: display, excludingWindows: content.windows.filter { isPrivatePresenterWindow($0, ownerPID: owner.processID) }) : SCContentFilter(display: display, excludingApplications: [owner], exceptingWindows: included))
        trackedWindowId = nil
        currentDisplayId = displayID
        startWindowValidationIfNeeded()
        if let overlay = drawingStream { try? await overlay.stopCapture() }
        queue.sync { drawingStream = nil; drawingImage = nil; windowImage = nil; windowFrame = display.frame }
        print("DISPLAY_SWITCHED \(displayID)"); fflush(stdout)
    }
    func setAppWindowsVisible(_ visible: Bool) async throws {
        showAppWindows = visible
        if let display = currentDisplayId { try await switchDisplay(display) }
    }

	func setAudio(microphone: Bool, system: Bool) {
		queue.async {
			self.microphoneAudible = microphone
			self.systemAudioAudible = system
		}
	}

	// Preserve the audio clock while an environment mutes an input. Dropping
	// buffers would produce gaps or collapse timing when the sidecars are mixed.
	private func silentAudio(_ sample: CMSampleBuffer) -> CMSampleBuffer? {
		guard let format = sample.formatDescription,
			let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format),
			asbd.pointee.mFormatID == kAudioFormatLinearPCM,
			let original = CMSampleBufferGetDataBuffer(sample) else { return nil }
		let length = CMBlockBufferGetDataLength(original)
		var data: CMBlockBuffer?
		guard CMBlockBufferCreateWithMemoryBlock(allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: length, blockAllocator: kCFAllocatorDefault, customBlockSource: nil, offsetToData: 0, dataLength: length, flags: 0, blockBufferOut: &data) == kCMBlockBufferNoErr,
			let data, CMBlockBufferFillDataBytes(with: 0, blockBuffer: data, offsetIntoDestination: 0, dataLength: length) == kCMBlockBufferNoErr else { return nil }
		var silence: CMSampleBuffer?
		guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: kCFAllocatorDefault, dataBuffer: data, formatDescription: format, sampleCount: CMSampleBufferGetNumSamples(sample), presentationTimeStamp: sample.presentationTimeStamp, packetDescriptions: nil, sampleBufferOut: &silence) == noErr else { return nil }
		return silence
	}

	func pauseCapture() {
		guard isRecording, !isPaused else { return }
		isPaused = true
		for player in soundPlayers.values { player.pause() }
		pauseStartedHostTime = CMClockGetTime(CMClockGetHostTimeClock())
		pendingResumeAdjustment = false
	}

	func resumeCapture() {
		guard isRecording, isPaused else { return }
		isPaused = false
		for player in soundPlayers.values { player.play() }
		pendingResumeAdjustment = true
	}

	func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of outputType: SCStreamOutputType) {
		guard sessionStarted, sampleBuffer.isValid, isRecording else { return }
		guard let presentationTime = adjustedPresentationTime(for: sampleBuffer, outputType: outputType) else { return }

		if outputType == .screen {
			guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
					  let attachment = attachments.first,
					  let statusRawValue = attachment[SCStreamFrameInfo.status] as? Int,
					  let status = SCFrameStatus(rawValue: statusRawValue),
					  status == .complete else {
				return
			}

			guard let videoInput = videoInput, videoInput.isReadyForMoreMediaData else { return }

			if firstSampleTime == .zero {
				firstSampleTime = sampleBuffer.presentationTimeStamp
			}

			if let pixel = sampleBuffer.imageBuffer {
				if stream === drawingStream && drawingImage == nil {
					fputs("Drawing capture first frame: \(CVPixelBufferGetWidth(pixel))x\(CVPixelBufferGetHeight(pixel))\n", stderr)
				}
				if stream === drawingStream { drawingImage = CIImage(cvPixelBuffer: pixel) }
				else { windowImage = CIImage(cvPixelBuffer: pixel) }
			}
			guard windowImage != nil else { return }
			// Either stream may drive a frame, so ink animates even over a static window.
			guard frameCount == 0 || presentationTime > lastVideoPresentationTime else { return }
			if drawingStream != nil && frameCount > 0 && (presentationTime - lastVideoPresentationTime).seconds < 1.0 / 65.0 { return }
			let composed = compositedSample(sampleBuffer)
			if stream === drawingStream && composed == nil { return }
			let sampleBuffer = composed ?? sampleBuffer
			lastSampleBuffer = sampleBuffer
			let timing = CMSampleTimingInfo(duration: sampleBuffer.duration, presentationTimeStamp: presentationTime, decodeTimeStamp: sampleBuffer.decodeTimeStamp)
			if let retimedSampleBuffer = try? CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing]) {
				videoInput.append(retimedSampleBuffer)
				lastVideoPresentationTime = presentationTime
				lastVideoDuration = sampleBuffer.duration
				frameCount += 1
			}
			return
		}

		if outputType == .audio {
			guard let systemAudioInput, let sampleBuffer = systemAudioAudible ? sampleBuffer : silentAudio(sampleBuffer) else { return }
			appendAudioSampleBuffer(sampleBuffer, to: systemAudioInput, firstSampleTime: &firstSystemAudioSampleTime, presentationTime: presentationTime)
			// Also write system audio to the inline video track
			if let inlineAudioInput, inlineAudioInput.isReadyForMoreMediaData {
				appendAudioSampleBuffer(sampleBuffer, to: inlineAudioInput, firstSampleTime: &firstInlineAudioSampleTime, presentationTime: presentationTime)
			}
			return
		}

		if outputType.rawValue == microphoneOutputTypeRawValue {
			guard let sampleBuffer = microphoneAudible ? sampleBuffer : silentAudio(sampleBuffer) else { return }
			if let microphoneOnlyInput {
				appendAudioSampleBuffer(sampleBuffer, to: microphoneOnlyInput, firstSampleTime: &firstMicrophoneSampleTime, presentationTime: presentationTime)
			}
			// Write mic to inline video track only if there's no system audio (avoids double-writing)
			if !capturesSystemAudio, let inlineAudioInput, inlineAudioInput.isReadyForMoreMediaData {
				appendAudioSampleBuffer(sampleBuffer, to: inlineAudioInput, firstSampleTime: &firstInlineAudioSampleTime, presentationTime: presentationTime)
			}
			return
		}

		return
	}

	func stream(_ stream: SCStream, didStopWithError error: Error) {
		fputs("Error: \(error.localizedDescription)\n", stderr)
		fflush(stderr)
	}

	private func finishCapture() async throws -> String {
		windowValidationTask?.cancel()
		windowValidationTask = nil
		trackedWindowId = nil

		for player in soundPlayers.values { player.stop() }
		soundPlayers.removeAll()
		if let overlay = drawingStream { try? await overlay.stopCapture() }
		drawingStream = nil
		drawingImage = nil
		windowImage = nil
		if let activeStream = stream {
			do {
				try await activeStream.stopCapture()
			} catch {
				// Stream may have already been stopped by the system — continue with file finalization
			}
		}
		stream = nil
		isRecording = false

		if let originalBuffer = lastSampleBuffer, let videoInput = videoInput {
			let additionalTime = lastVideoPresentationTime + frameDuration(for: originalBuffer)
			let timing = CMSampleTimingInfo(duration: originalBuffer.duration, presentationTimeStamp: additionalTime, decodeTimeStamp: originalBuffer.decodeTimeStamp)
			if let additionalSampleBuffer = try? CMSampleBuffer(copying: originalBuffer, withNewTiming: [timing]) {
				videoInput.append(additionalSampleBuffer)
			}
		}

		let videoEndTime = lastVideoPresentationTime + (lastSampleBuffer.map { frameDuration(for: $0) } ?? .zero)
		let endTime = resolvedCaptureEndTime(videoEndTime: videoEndTime)
		assetWriter?.endSession(atSourceTime: endTime)
		videoInput?.markAsFinished()
		inlineAudioInput?.markAsFinished()
		await assetWriter?.finishWriting()

		systemAudioInput?.markAsFinished()
		await systemAudioWriter?.finishWriting()

		microphoneOnlyInput?.markAsFinished()
		await microphoneOnlyWriter?.finishWriting()

		let path = outputURL?.path ?? ""
		assetWriter = nil
		videoInput = nil
		systemAudioWriter = nil
		systemAudioInput = nil
		microphoneOnlyWriter = nil
		microphoneOnlyInput = nil
		inlineAudioInput = nil
		outputURL = nil
		microphoneOutputURL = nil
		sessionStarted = false
		firstSampleTime = .zero
		firstSystemAudioSampleTime = nil
		firstMicrophoneSampleTime = nil
		firstInlineAudioSampleTime = nil
		lastSampleBuffer = nil
		lastVideoPresentationTime = .zero
		lastVideoDuration = .zero
		lastInlineAudioPresentationTime = .invalid
		lastInlineAudioDuration = .zero
		frameCount = 0
		isPaused = false
		pauseStartedHostTime = nil
		pendingResumeAdjustment = false
		accumulatedPausedDuration = .zero
		capturesSystemAudio = false
		capturesMicrophone = false
		writesSystemAudioToSeparateTrack = false
		writesMicrophoneToSeparateTrack = false
		return path
	}

	private func adjustedPresentationTime(for sampleBuffer: CMSampleBuffer, outputType: SCStreamOutputType) -> CMTime? {
		if isPaused {
			return nil
		}

		let sampleTime = sampleBuffer.presentationTimeStamp
		if pendingResumeAdjustment, let pauseStartedHostTime {
			let pauseGap = sampleTime - pauseStartedHostTime
			if pauseGap > .zero {
				accumulatedPausedDuration = accumulatedPausedDuration + pauseGap
			}
			self.pauseStartedHostTime = nil
			pendingResumeAdjustment = false
		}

		if outputType == .screen {
			if firstSampleTime == .zero {
				firstSampleTime = sampleTime
			}
		}

		// Use video's first sample time as the common time base for ALL tracks.
		// This ensures audio files contain leading silence when audio hardware
		// delivers its first sample after the first video frame (e.g. iPhone mic
		// over Continuity Camera can lag 1-2 seconds behind).
		if firstSampleTime == .zero {
			// Video hasn't started yet — drop this audio sample to avoid
			// negative timestamps.
			return nil
		}

		return max(.zero, sampleTime - firstSampleTime - accumulatedPausedDuration)
	}

	private func frameDuration(for sampleBuffer: CMSampleBuffer) -> CMTime {
		if sampleBuffer.duration.isValid && sampleBuffer.duration > .zero {
			return sampleBuffer.duration
		}

		if lastVideoDuration.isValid && lastVideoDuration > .zero {
			return lastVideoDuration
		}

		return CMTime(value: 1, timescale: CMTimeScale(targetCaptureFPS))
	}

	private func latestInlineAudioEndTime() -> CMTime {
		guard lastInlineAudioPresentationTime.isValid else {
			return .invalid
		}

		if lastInlineAudioDuration.isValid && lastInlineAudioDuration > .zero {
			return lastInlineAudioPresentationTime + lastInlineAudioDuration
		}

		return lastInlineAudioPresentationTime
	}

	private func resolvedCaptureEndTime(videoEndTime: CMTime) -> CMTime {
		let inlineAudioEndTime = latestInlineAudioEndTime()
		guard inlineAudioEndTime.isValid else {
			return videoEndTime
		}

		if CMTimeCompare(inlineAudioEndTime, videoEndTime) <= 0 {
			return videoEndTime
		}

		// Prevent a stray inline-audio timestamp from forcing finishWriting
		// to finalize an arbitrarily long tail.
		let tailExtension = CMTimeSubtract(inlineAudioEndTime, videoEndTime)
		return videoEndTime + CMTimeMinimum(tailExtension, maxInlineAudioTailExtension)
	}

	private func appendAudioSampleBuffer(_ sampleBuffer: CMSampleBuffer, to input: AVAssetWriterInput, firstSampleTime: inout CMTime?, presentationTime: CMTime) {
		guard input.isReadyForMoreMediaData else { return }

		if firstSampleTime == nil {
			firstSampleTime = presentationTime
		}

		// presentationTime is already relative to the video's first frame
		// (computed by adjustedPresentationTime), so use it directly.
		let timing = CMSampleTimingInfo(duration: sampleBuffer.duration, presentationTimeStamp: presentationTime, decodeTimeStamp: sampleBuffer.decodeTimeStamp)
		if let retimedSampleBuffer = try? CMSampleBuffer(copying: sampleBuffer, withNewTiming: [timing]) {
			let appended = input.append(retimedSampleBuffer)
			if appended, input === inlineAudioInput {
				lastInlineAudioPresentationTime = presentationTime
				lastInlineAudioDuration = sampleBuffer.duration
			}
		}
	}

	private static func audioOutputSettings(bitRate: Int) -> [String: Any] {
		[
			AVFormatIDKey: kAudioFormatMPEG4AAC,
			AVSampleRateKey: 48_000,
			AVNumberOfChannelsKey: 2,
			AVEncoderBitRateKey: bitRate,
		]
	}

	private static func resolveMicrophoneCaptureDeviceID(config: CaptureConfig) -> String? {
		let audioDevices = AVCaptureDevice.devices(for: .audio)

		if let microphoneLabel = config.microphoneLabel?.trimmingCharacters(in: .whitespacesAndNewlines), !microphoneLabel.isEmpty {
			if let matchedDevice = audioDevices.first(where: { $0.localizedName == microphoneLabel }) {
				return matchedDevice.uniqueID
			}
		}

		if let microphoneDeviceId = config.microphoneDeviceId?.trimmingCharacters(in: .whitespacesAndNewlines), !microphoneDeviceId.isEmpty {
			if audioDevices.contains(where: { $0.uniqueID == microphoneDeviceId }) {
				return microphoneDeviceId
			}
		}

		return nil
	}

	private func supportsNativeMicrophoneCapture(streamConfig: SCStreamConfiguration) -> Bool {
		let supportsConfigSelector = streamConfig.responds(to: Selector(("setCaptureMicrophone:")))
		let supportsDeviceSelector = streamConfig.responds(to: Selector(("setMicrophoneCaptureDeviceID:")))
		let supportsOutputType = SCStreamOutputType(rawValue: microphoneOutputTypeRawValue) != nil
		return supportsConfigSelector && supportsDeviceSelector && supportsOutputType
	}

	private func startWindowValidationIfNeeded() {
		guard let trackedWindowId else {
			windowValidationTask?.cancel()
			windowValidationTask = nil
			return
		}

		windowValidationTask?.cancel()
		windowValidationTask = Task.detached(priority: .utility) { [weak self] in
			guard let self else { return }
            var missingCount = 0
			while !Task.isCancelled {
				try? await Task.sleep(nanoseconds: 500_000_000)
				if Task.isCancelled { return }
				guard self.isRecording else { return }

				do {
					let availableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
					if Task.isCancelled || self.trackedWindowId != trackedWindowId { return }
					let tracked = availableContent.windows.first(where: { $0.windowID == trackedWindowId })
					if let tracked { self.queue.async { self.windowFrame = tracked.frame } }
					let windowStillAvailable = tracked != nil
					if windowStillAvailable { missingCount = 0 }
                    else { missingCount += 1 }
                    if !windowStillAvailable && missingCount >= 8 {
						print("WINDOW_UNAVAILABLE")
						fflush(stdout)
						let outputPath = try await self.finishCapture()
						print("Recording stopped. Output path: \(outputPath)")
						fflush(stdout)
						exit(0)
					}
				} catch {
					continue
				}
			}
		}
	}

	private static func scaleFactor(for displayId: CGDirectDisplayID) -> Int {
		guard let mode = CGDisplayCopyDisplayMode(displayId) else {
			return 1
		}
		return max(1, mode.pixelWidth / max(1, mode.width))
	}
}

final class RecorderService {
	private let recorder = ScreenCaptureRecorder()
	private let queue = DispatchQueue(label: "recordly.screencapturekit.commands")
	private let completionGroup = DispatchGroup()

	func start(configJSON: String) {
		completionGroup.enter()
		queue.async {
			Task {
				do {
					try await self.recorder.startCapture(configJSON: configJSON)
				} catch {
					fputs("Error starting capture: \(error.localizedDescription)\n", stderr)
					fflush(stderr)
					self.completionGroup.leave()
				}
			}
		}
	}

	func stop() {
		queue.async {
			Task {
				do {
					let outputPath = try await self.recorder.stopCapture()
					print("Recording stopped. Output path: \(outputPath)")
					fflush(stdout)
					self.completionGroup.leave()
				} catch {
					fputs("Error stopping capture: \(error.localizedDescription)\n", stderr)
					fflush(stderr)
					self.completionGroup.leave()
				}
			}
		}
	}

	func playSound(_ encoded: String) { recorder.playSound(encoded) }
	func shake(strength: Double, durationMs: Double) { recorder.shake(strength: strength, durationMs: durationMs) }
	func setDrawing(_ id: UInt32, board: Bool) {
		queue.async {
			Task {
				do { try await self.recorder.setDrawing(windowID: id, board: board); print("DRAWING_READY"); fflush(stdout) }
				catch { print("DRAWING_FAILED"); fflush(stdout) }
			}
		}
	}
	func setAudio(microphone: Bool, system: Bool) {
		recorder.setAudio(microphone: microphone, system: system)
	}

	func pause() {
		queue.async {
			self.recorder.pauseCapture()
		}
	}

	func resume() {
		queue.async {
			self.recorder.resumeCapture()
		}
	}

	func switchWindow(_ id: UInt32) {
		queue.async {
			Task {
				do { try await self.recorder.switchWindow(id) }
				catch { print("SOURCE_SWITCH_FAILED \(id)"); fflush(stdout) }
			}
		}
	}

    func switchDisplay(_ id: UInt32) {
        queue.async { Task {
            do { try await self.recorder.switchDisplay(id) }
            catch { print("SOURCE_SWITCH_FAILED \(id)"); fflush(stdout) }
        } }
    }
    func setAppWindowsVisible(_ visible: Bool) {
        queue.async { Task {
            do { try await self.recorder.setAppWindowsVisible(visible); print("APP_WINDOWS_READY") }
            catch { print("APP_WINDOWS_FAILED") }
            fflush(stdout)
        } }
    }

	func waitUntilFinished() {
		completionGroup.wait()
	}
}

guard CommandLine.arguments.count >= 2 else {
	fputs("Missing config JSON\n", stderr)
	fflush(stderr)
	exit(1)
}

// Force CoreGraphics Services initialization on the main thread.
// Without this, SCContentFilter(desktopIndependentWindow:) crashes with
// CGS_REQUIRE_INIT because CGS is never initialised in a CLI tool.
let _ = CGMainDisplayID()

// Permission requests belong to the app's explicit setup flow. Never request
// again from a child process: a stale signing identity cannot be fixed here.
if !CGPreflightScreenCaptureAccess() {
	fputs("SCREEN_RECORDING_PERMISSION_DENIED\n", stderr)
	fflush(stderr)
	exit(1)
}

// Pre-flight check for microphone access when mic capture is requested.
if let configData = CommandLine.arguments[1].data(using: .utf8),
   let config = try? JSONDecoder().decode(CaptureConfig.self, from: configData),
   config.capturesMicrophone == true {
	switch AVCaptureDevice.authorizationStatus(for: .audio) {
	case .authorized:
		break
	case .notDetermined:
		let sem = DispatchSemaphore(value: 0)
		AVCaptureDevice.requestAccess(for: .audio) { _ in sem.signal() }
		sem.wait()
		if AVCaptureDevice.authorizationStatus(for: .audio) != .authorized {
			fputs("MICROPHONE_PERMISSION_DENIED\n", stderr)
			fflush(stderr)
			exit(1)
		}
	default:
		fputs("MICROPHONE_PERMISSION_DENIED\n", stderr)
		fflush(stderr)
		exit(1)
	}
}

let service = RecorderService()
service.start(configJSON: CommandLine.arguments[1])

DispatchQueue.global(qos: .utility).async {
	while let input = readLine(strippingNewline: true) {
		if input.hasPrefix("shake ") {
			let parts = input.split(separator: " ")
			if parts.count == 3, let strength = Double(parts[1]), let duration = Double(parts[2]) { service.shake(strength: strength, durationMs: duration) }; continue
		}
		if input.hasPrefix("sound ") { service.playSound(String(input.dropFirst(6))); continue }
		if input.hasPrefix("drawing ") {
			let parts = input.split(separator: " ")
			if parts.count == 3, let id = UInt32(parts[1]) { service.setDrawing(id, board: parts[2] == "board") }
			continue
		}
		if input.hasPrefix("audio ") {
			let parts = input.split(separator: " ")
			if parts.count == 3, ["on", "off"].contains(parts[1]), ["on", "off"].contains(parts[2]) {
				service.setAudio(microphone: parts[1] == "on", system: parts[2] == "on")
			}
			continue
		}
        if input.hasPrefix("switch-display "), let id = UInt32(input.dropFirst(15)) { service.switchDisplay(id); continue }
        if input.hasPrefix("show-app-windows ") { service.setAppWindowsVisible(input == "show-app-windows 1"); continue }

		if input.hasPrefix("switch-window "), let id = UInt32(input.dropFirst(14)) {
			service.switchWindow(id)
			continue
		}
		if input == "pause" {
			service.pause()
			continue
		}

		if input == "resume" {
			service.resume()
			continue
		}

		if input == "stop" {
			service.stop()
			break
		}
	}
}

service.waitUntilFinished()

