# LugChat (Tauri + Svelte)

A multi-system LugChat application featuring a web-based user interface.  We are using [Tauri](https://tauri.app) to enable creating a web based UI using the system's WebKit renderer without the requirement of installing Electron.  This will enable much smaller builds and distributions.

Applications must be built on the target system (i.e Mac for Mac).  This is a requirement by Tauri and one of the downsides.


## Development

Tauri supports hot swapping both the Web and Rust portions of the code during development.  This allows for quick turn around and testing.

### Prerequisites

Generally speaking, you require the prerequsites for [Tauri](https://tauri.app/v1/guides/getting-started/prerequisites).

The Minimum Supported Rust Version (MSRV) required should be 1.64.  Also, in order to build some dependencies some experimental features are required.  This will require the _nightly_ toolchain to be installed.

> The __rust-toolchain__ file will automatically configure the utilization of the _nightly_ toolchain but you must install this version manually.

#### Windows

For Windows, you'll need to install the following in order to build and test:
- Git
- NodeJS
    - Currently only tested on Node 16 but should work on 18.
- OpenSSL for Windows  
- Microsoft Visual Studio C++ Build Tools
    - You'll need to select the following components during installation:
        - MSVC v143
        - Windows 10 SDK (10.0.1.10941.0)
- WebView2

> **NOTE:**
> On Windows 10 (Version 1803 and later with all updates applied) and Windows 11, the Webview2 runtime is distributed as part of the operating system.

1. System Dependencies
Recommendation is to use the `winget` utility to install some or all of the dependencies via Powershell or command line.

```powershell
winget install Git.Git
winget install ShiningLight.OpenSSL
winget install Microsoft.VisualStudio.2022.BuildTools
winget install OpenJS.NodeJS.LTS
```

2. Rust
In order to install `rustup` and the associated toolchains, you can either install it via `winget` or downloaded shell script.  

```powershell
# Install rustup via your preferred method (winget is shown below)
winget install Rustlang.Rustup

# Once `rustup` is installed, install the nightly toolchain
rustup target add nightly

```

#### macOS
1. CLang and macOS Development Dependencies

You will need to install CLang and macOS development dependencies. To do this, run the following command in your terminal:

```bash
xcode-select --install
```

2. Rust

To install Rust on macOS, open a terminal and enter the following command to blindly install via curl-bashing:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

> **NOTE:** I typically checkout the Rustup repository and manually run the install script from there.

Once `rustup` is installed, install the nightly toolchain:

```bash
rustup target add nightly
```


#### Linux
A Linux installation is fairly straight-forward and mainly requires a C compiler, some development libraries for OpenSSL and the GTK's WebKit2.

1.  Install Rust
While some distributions include a version of Rust now, it is typically fairly far behind and the recommendation is to install it via their blind curl-bashing:

```bash
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
```

> **NOTE:** I typically checkout the Rustup repository and manually run the install script from there.

Once `rustup` is installed, install the nightly toolchain:

```bash
rustup target add nightly
```

2. System Dependencies

You will need to install a couple of system dependencies, such as a C compiler and webkit2gtk. Below are commands for a few popular distributions:

**Debian**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
    build-essential \
    curl \
    wget \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev
```

**Gentoo / Funtoo**
```bash
sudo emerge --ask \
    net-libs/webkit-gtk:4 \
    dev-libs/libappindicator \
    net-misc/curl \
    net-misc/wget
```

### Building

> **NOTE:**
> For Windows, you will need to include an environment variable for the location of OpenSSL  

**Hot Swap Development Build**
```bash
npm run tauri dev
```

**Production Build***
```bash
npm run tauri build
```

#### Enabling Rust Logging
Currently there is no logging within the Rust code but printouts, i.e. `println!` macros, are disabled by default.  To enable these during development, export or set the following environment variable: __RUST_BACKTRACE__

**Example**
```bash
RUST_BACKTRACE=1 npm run tauri dev
```

#### Debugging Rust Code

See the following guide for [Setting up LLDB on VSCode](https://tauri.app/v1/guides/debugging/vs-code) within the Tauri documentation.

## Recommended IDE Setup
Use one of the following editors
- [VS Code](https://code.visualstudio.com/) 
- [VSCodium](https://vscodium.com/)

The following extensions are recommended:
- [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) 
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Decisions, Known Issues, Limitations

### Use of Native TLS
Currently, I'm using the system's version of TLS (SChannel on Windows and OpenSSL on Linux) for handling secure websocket connections.  My initial thought was that this would improve distribution but I'm uncertain if this is the correct.

I believe this should be reevaluated.

### Use of Svelte
I decided to try out Svelte for the front-end code.  It seemed like a fun 
choice to start off with but I realize we may want to switch to another 
front-end library.

> _(Kudase opinion)_ The biggest issue with Svelte, appears to be in the routing 
for SPA.  SvelteKit appears to be the most recommended (there are alternatives) 
but their implementation annoys me. 

