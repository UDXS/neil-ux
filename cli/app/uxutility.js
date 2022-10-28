/*
   Copyright 2022 Davit Margarian

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

console.log("neil-ux: Neil Web Desktop Utility");
console.log("Davit Markarian\n");

const root = "/home/shared/.neil-ux/store/";
const vncPortBase = 5900;
const webPortBase = 5800;
const vncDisplayBase = 0;
const portBlockSize = 100; // base + size - 1 = highest port number

const fs = require("fs");
const os = require("os");
const lockfile = require("proper-lockfile");
const killPortUser = require("kill-port");
const { execSync, exec } = require("child_process");
const onDeath = require("death")({ uncaughtException: true, SIGHUP: true });

const username = os.userInfo().username;
const homeDir = os.userInfo().homedir;
let db;

function dbBackup() {
	fs.copyFileSync(root + "alloc", root + "alloc.bak", fs.constants.COPYFILE_FICLONE);
	console.log("Database backed up.");
}

function portAllocate(base, used) {
	for (let port = base; port < base + portBlockSize; port++) {
		let usable = true;
		for (let u of used) {
			if (port == u)
				usable = false;
		}
		if (usable)
			return port;
	}
	console.error("Allocation space has been exhausted. Contact ")
}

function recordExists() {
	if (db[username] == undefined)
		return false;
	if (db[username].vncDisplay == undefined)
		return false;
	if (db[username].webPort == undefined)
		return false;
	return true;
}
function recordCreate() {
	const entries = Object.values(db);
	const record = {
		vncDisplay: portAllocate(vncDisplayBase, entries.map(e => e.vncDisplay)),
		webPort: portAllocate(webPortBase, entries.map(e => e.webPort)),
	};

	db[username] = record;
	fs.writeFileSync(root + "alloc", JSON.stringify(db, null, "\t"));
}
function recordRead() {
	if (!recordExists()) {
		console.log("Adding you to database...");
		//dbBackup();
		delete db[username];
		recordCreate();
		console.log("Added.\n");
	}

	rec = db[username];


	return db[username];
}

function recordPrint(rec) {
	return `\t- Web (HTTP) at ${rec.webPort}\n\t- VNC at :${rec.vncDisplay} (${rec.vncDisplay + vncPortBase})`;
}

if (username == "root") {
	console.error("Do not run as root. Switch user or remove 'sudo' from your invocation.")
	throw "FatalRootUserDisallowed"
}

console.log(`Hello, ${username}`);

fs.mkdirSync(root, { recursive: true }, (err) => { if (err) throw err });
if (!fs.existsSync(root + "alloc")) {
	console.log("Couldn't find port allocations database. Creating...")
	fs.writeFileSync(root + "alloc", "{}");
}

lockfile.lock(root + "alloc", {
	lockfilePath: root + "alloc.lock",
	retries: 8
}).then(release => {
	try {
		db = JSON.parse(fs.readFileSync(root + "alloc", "utf-8"));
		try {
			if (process.env.NEIL_UX_MODE == "RemoteStart")
				initUI(release);
			else if (process.env.NEIL_UX_MODE == "Setup")
				informUI(true, release);
			else
				throw "Invalid Startup Mode. Please call this script with 'neil-ux'."
		} catch (e) {
			console.log(e)
		}

	} catch (e) {
		console.error("Couldn't read the port allocations database. Contact your local administrator.");
		throw e;
	}
}).catch(e => {
	console.error("Couldn't lock the port allocations database. Try again later or contact your local administrator.");
	throw e;
});

function run(cmd) {
	//console.log(cmd);
	try {
		execSync(cmd, { encoding: "utf-8" });
	} catch (e) { }
}

function informUI(showCfg, release) {
	let rec = recordRead();

	console.log("On file for you:\n" + recordPrint(rec) + "\n");
	if (release)
		release();

	if (!showCfg) {
		console.log("Run 'neil-ux' in a server shell to see SSH config again.\n")
		return;
	}

	console.log("\nCopy and complete this to your computer's SSH config ONCE.\n")
	console.log("======== Your SSH Configuration ========")
	console.log(`
Host neil-desktop
	Hostname dust.sdsc.edu
	User ${username}
	IdentityFile <YOUR IDENTITY FILE PATH>
	LocalForward 8086 localhost:${rec.webPort}
	LocalForward 8087 localhost:${rec.vncDisplay + vncPortBase}
	ExitOnForwardFailure yes
	ServerAliveInterval 60
	RequestTTY yes
	RemoteCommand /home/shared/.neil-ux/app/remote_startup
	`)
	console.log("========================================")
	console.log("\nReady? On your computer, run 'ssh neil-desktop'\nand then navigate to http://127.0.0.1:8086/vnc.html?autoconnect=true in your browser.\n")
}

async function initUI(release) {
	if (!recordExists()) {
		console.error("\nYou haven't been given a desktop yet.\nRun 'neil-ux' in a server shell to get started.\n");
		return;
	}

	informUI(false);


	let rec = recordRead();
	release();

	try {
		await killPortUser(rec.vncDisplay + vncPortBase, "tcp");
	} catch (e) {

	}

	try {
		await killPortUser(rec.webPort, "tcp");
	} catch (e) {

	}

	onDeath(finishSession);

	console.log("Killed any processes using these ports.");
	console.log("Killing VNC...");
	let cmd = `vncserver -kill :${rec.vncDisplay}`;
	run(cmd);

	console.log("Restarting VNC...");
	cmd = `cd ${homeDir} && vncserver -SecurityTypes None -geometry 1920x1080 :${rec.vncDisplay} -- /opt/neil-ux-chooser/app-linux_x64`;
	run(cmd);

	console.log("Starting web server...");
	cmd = `/opt/noVNC/utils/novnc_proxy --web /opt/noVNC --listen ${rec.webPort} --vnc localhost:${rec.vncDisplay + vncPortBase}`;
	exec(cmd);
	setTimeout(() => {
		console.log("\n\nFor Web Desktop:\nNavigate to http://127.0.0.1:8086/vnc.html?autoconnect=true\n");
		console.log("For VNC:\nOpen 127.0.0.1:8087 in your VNC client\n");
		console.log("Note: if you stop this SSH session, you will stop the desktop session.\nUnsaved work will be lost.\n");
		console.log("Ctrl-C to stop session. Do not end the session by closing terminal.\n");
	}, 1000);
}

function finishSession() {
	let rec = recordRead();
	console.log("\nEnding desktop session (killing VNC)...");
	let cmd = `vncserver -kill :${rec.vncDisplay}`;
	run(cmd);
	console.log("\nGoodbye\n");
	process.exit();
}
