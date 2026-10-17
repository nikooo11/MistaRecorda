// Clean, low-latency companion preview. Ink stays local on the tablet and is
// composited independently on the Mac/recording, avoiding a round-trip ink echo.
import Foundation
import CoreGraphics
import CoreMedia
import CoreImage
import ScreenCaptureKit
import Darwin
final class Preview: NSObject, SCStreamOutput, SCStreamDelegate {
 let context = CIContext(options: [.cacheIntermediates: false])
 let color = CGColorSpace(name: CGColorSpace.sRGB)!
 var stream: SCStream?
 func stream(_ stream: SCStream, didOutputSampleBuffer sample: CMSampleBuffer, of type: SCStreamOutputType) {
  guard type == .screen, let buffer = sample.imageBuffer else { return }
  autoreleasepool {
   let image = CIImage(cvPixelBuffer: buffer)
   guard let data = context.jpegRepresentation(of: image, colorSpace: color, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.72]) else { return }
   var length = UInt32(data.count).bigEndian
   FileHandle.standardOutput.write(Data(bytes: &length, count: 4))
   FileHandle.standardOutput.write(data)
  }
 }
 func stream(_ stream: SCStream, didStopWithError error: Error) { fputs("Companion preview stopped.\n", stderr); exit(1) }
 func start(displayID: UInt32, ownerPID: Int32, showAppWindows: Bool) async throws {
  let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
  guard let display = content.displays.first(where: {$0.displayID == displayID}), let owner = content.applications.first(where: {$0.processID == ownerPID}) else { throw NSError(domain:"Companion",code:1) }
  let filter = SCContentFilter(display: display, excludingApplications: showAppWindows ? [] : [owner], exceptingWindows: [])
  let config = SCStreamConfiguration()
  config.width = min(1600, display.width); config.height = Int(Double(config.width) * Double(display.height) / Double(display.width))
  config.minimumFrameInterval = CMTime(value: 1, timescale: 30); config.queueDepth = 3
  config.showsCursor = true; config.capturesAudio = false; config.pixelFormat = kCVPixelFormatType_32BGRA
  let capture = SCStream(filter: filter, configuration: config, delegate: self); stream = capture
  try capture.addStreamOutput(self, type: .screen, sampleHandlerQueue: DispatchQueue(label:"companion.preview",qos:.userInteractive))
  try await capture.startCapture()
 }
}
let _ = CGMainDisplayID()
guard CommandLine.arguments.count >= 3, let display = UInt32(CommandLine.arguments[1]), let pid = Int32(CommandLine.arguments[2]), CGPreflightScreenCaptureAccess() else { fputs("Screen permission is required for companion preview.\n",stderr); exit(1) }
let preview = Preview()
Task { do { try await preview.start(displayID:display,ownerPID:pid,showAppWindows: CommandLine.arguments.count > 3 && CommandLine.arguments[3] == "1") } catch { fputs("Could not start clean companion preview.\n",stderr); exit(1) } }
// Exit when the owning Electron process closes stdin.
DispatchQueue.global().async { while !FileHandle.standardInput.readData(ofLength:1).isEmpty {} ; exit(0) }
dispatchMain()
