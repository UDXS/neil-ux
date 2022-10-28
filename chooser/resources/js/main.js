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

const actions = {
    "lxqt": "startlxqt",
    "xfce4": "xfce4-session",
    "motif": "mwm",
    "openbox": "openbox",
    "xterm": "xterm",
    "minecraft": "minecraft-launcher",

}

async function setUsername() {
    let un = await Neutralino.os.getEnv("USER");
    document.getElementById("username").innerText = `, ${un}.`;
}

async function runCmd(cmd) {
    Neutralino.os.spawnProcess(cmd);
}



let clicksEnabled = true;

Neutralino.events.on("ready", () => {
    setUsername();
    for (let entry of document.getElementsByClassName("env-elem")) {
        entry.addEventListener("click", () => {
            if (!clicksEnabled)
                return;
            runCmd(actions[entry.id]);
            clicksEnabled = false;
            Neutralino.window.hide();
        });
    }
  });

Neutralino.events.on("spawnedProcess", (evt) => {
    switch (evt.detail.action) {
        case 'stdOut':
            console.log(evt.detail.data);
            break;
        case 'stdErr':
            console.error(evt.detail.data);
            break;
        case 'exit':
            Neutralino.window.show().then(() => Neutralino.window.focus() );
            setTimeout(() => clicksEnabled = true, 250);
            break;
    }
})

Neutralino.init();
