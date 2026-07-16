// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "vela-ios",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "VelaCore", targets: ["VelaCore"]),
        .library(name: "VelaUI", targets: ["VelaUI"]),
        .executable(name: "VelaApp", targets: ["VelaApp"]),
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", from: "6.29.0"),
        .package(url: "https://github.com/apple/swift-async-algorithms.git", from: "1.0.0"),
    ],
    targets: [
        // ── Core 数据层（纯逻辑、无 UI） ──
        .target(
            name: "VelaCore",
            dependencies: [
                .product(name: "GRDB", package: "grdb.swift"),
                .product(name: "AsyncAlgorithms", package: "swift-async-algorithms"),
            ],
            path: "Sources/VelaCore"
        ),
        // ── UI 组件层 ──
        .target(
            name: "VelaUI",
            dependencies: ["VelaCore"],
            path: "Sources/VelaUI"
        ),
        // ── App 入口 ──
        .executableTarget(
            name: "VelaApp",
            dependencies: ["VelaCore", "VelaUI"],
            path: "Sources/VelaApp"
        ),
        // ── 测试 ──
        .testTarget(
            name: "VelaTests",
            dependencies: ["VelaCore", "VelaUI"],
            path: "Tests"
        ),
    ]
)