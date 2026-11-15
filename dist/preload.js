"use strict";var L=/^https:\/\/(?:discordapp\.com|(?:(?:ptb|canary)\.)?discord\.com)$/,C=e=>L.test(e);var o=require("electron/renderer"),D=require("os");var M={en:{title:"Share your screen",screens:"Screens",windows:"Windows",audio:"Share sound too",audioHint:"Everything the computer plays is shared, except Endcord's own sound, so the call doesn't hear itself",audioHintAll:"Everything the computer plays is shared, voice chat included",cancel:"Cancel",share:"Share",none:"Nothing to share was found"},tr:{title:"Ekran\u0131n\u0131 payla\u015F",screens:"Ekranlar",windows:"Pencereler",audio:"Sesi de payla\u015F",audioHint:"Bilgisayarda \xE7alan her ses payla\u015F\u0131l\u0131r, Endcord'un kendi sesi hari\xE7: sohbet kendini duymaz",audioHintAll:"Bilgisayarda \xE7alan her ses payla\u015F\u0131l\u0131r, sesli sohbet de dahil",cancel:"Vazge\xE7",share:"Payla\u015F",none:"Payla\u015F\u0131lacak bir \u015Fey bulunamad\u0131"}},H=`
:host { all: initial; }
.backdrop {
    position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center;
    background: rgb(6 10 20 / 72%); font: 14px/1.4 "Barlow", "Bahnschrift", "Segoe UI", system-ui, sans-serif; color: #f3f6fb;
}
.dialog {
    width: min(760px, calc(100vw - 32px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column;
    background: #162137; border: 1px solid #253452; border-radius: 12px; box-shadow: 0 24px 64px rgb(0 0 0 / 45%);
}
h1 { margin: 0; padding: 20px 24px 4px; font-size: 20px; font-weight: 600; letter-spacing: 0.01em; }
.body { overflow-y: auto; padding: 8px 24px 16px; }
h2 { margin: 16px 0 8px; font-size: 13px; font-weight: 600; color: #b3bfd4; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
.source {
    display: flex; flex-direction: column; gap: 6px; padding: 6px; margin: 0; text-align: left; cursor: pointer;
    background: #10182a; border: 2px solid #253452; border-radius: 8px; color: inherit; font: inherit;
}
.source:hover { border-color: #33456a; }
.source[aria-pressed="true"] { border-color: #5288f0; background: #1d2b46; }
.source:focus-visible { outline: 2px solid #9ccbff; outline-offset: 2px; }
.source img { width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #0b1120; border-radius: 4px; }
.source span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 13px; }
.empty { padding: 24px 0; color: #b3bfd4; }
.footer { display: flex; align-items: center; gap: 12px; padding: 14px 24px; border-top: 1px solid #253452; }
label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
label input { margin: 3px 0 0; accent-color: #3d74e0; }
label small { display: block; color: #b3bfd4; font-size: 12px; }
.spacer { flex: 1; }
button.action {
    min-width: 96px; padding: 8px 16px; border-radius: 8px; border: 1px solid #33456a; cursor: pointer;
    background: transparent; color: #f3f6fb; font: inherit; font-weight: 600;
}
button.action:focus-visible { outline: 2px solid #9ccbff; outline-offset: 2px; }
button.primary { background: #3d74e0; border-color: #3d74e0; }
button.primary:hover { background: #5288f0; }
button.primary:disabled { opacity: 0.5; cursor: default; }
`;function t(e,a={},...r){let i=document.createElement(e);return Object.assign(i,a),i.append(...r),i}var k=null;function O(){window.addEventListener("keydown",e=>{k?.(e)&&(e.preventDefault(),e.stopImmediatePropagation())},!0)}function P(e,a,r){let i=navigator.language.toLowerCase().startsWith("tr")?M.tr:M.en;return new Promise(I=>{let b=document.createElement("endcord-share-picker"),w=b.attachShadow({mode:"closed"}),s=e.find(n=>n.screen)?.id??e[0]?.id??null,c=n=>{k=null,b.remove(),I(n)},p=()=>s&&c({id:s,audio:a&&N.checked}),h=t("button",{className:"action primary",type:"button",textContent:i.share,disabled:!s});h.addEventListener("click",p);let u=t("button",{className:"action",type:"button",textContent:i.cancel});u.addEventListener("click",()=>c(null));let x=new Map,S=n=>{s=n;for(let[f,g]of x)g.setAttribute("aria-pressed",String(f===n));h.disabled=!1},v=(n,f)=>{if(!f.length)return[];let g=t("div",{className:"grid"});for(let d of f){let l=t("button",{className:"source",type:"button",title:d.name},t("img",{src:d.thumbnail,alt:""}),t("span",{textContent:d.name}));l.setAttribute("aria-pressed",String(d.id===s)),l.addEventListener("click",T=>{S(d.id),T.detail===0&&p()}),l.addEventListener("dblclick",()=>{S(d.id),p()}),x.set(d.id,l),g.append(l)}return[t("h2",{textContent:n}),g]},N=t("input",{type:"checkbox"}),y=t("div",{className:"footer"});a&&y.append(t("label",{},N,t("span",{},i.audio,t("small",{textContent:r?i.audioHint:i.audioHintAll})))),y.append(t("div",{className:"spacer"}),u,h);let A=t("div",{className:"body"},...v(i.screens,e.filter(n=>n.screen)),...v(i.windows,e.filter(n=>!n.screen)));e.length||A.append(t("div",{className:"empty",textContent:i.none}));let m=t("div",{className:"dialog"},t("h1",{id:"title",textContent:i.title}),A,y);m.setAttribute("role","dialog"),m.setAttribute("aria-modal","true"),m.setAttribute("aria-labelledby","title");let E=t("div",{className:"backdrop"},m);E.addEventListener("mousedown",n=>{n.target===E&&c(null)}),k=n=>{if(n.key==="Escape")c(null);else if(n.key==="Enter")w.activeElement===u?c(null):p();else return!1;return!0},w.append(t("style",{textContent:H}),E),document.documentElement.append(b),(s?x.get(s):u)?.focus()})}var G=process.argv.includes("--endcord-desktop-vanilla"),W=process.argv.find(e=>e.startsWith("--endcord-desktop-version="))?.slice(26)??"0.0.0";location.protocol==="https:"&&C(window.origin)&&(O(),o.contextBridge.exposeInMainWorld("EndcordDesktopShare",{async pick(e){let a=await o.ipcRenderer.invoke("EndcordDesktopGetSources");if(!a)return null;let r=await P(a,e&&process.platform==="win32",Number((0,D.release)().split(".")[2])>=19041);return!r||!await o.ipcRenderer.invoke("EndcordDesktopPickSource",r.id,r.audio)?null:{audio:r.audio}}}),o.webFrame.executeJavaScript(`(() => {
        const share = window.EndcordDesktopShare;
        const getDisplayMedia = MediaDevices.prototype.getDisplayMedia;
        MediaDevices.prototype.getDisplayMedia = async function (constraints = {}) {
            const picked = await share.pick(!!constraints.audio);
            if (!picked) throw new DOMException("Permission denied", "NotAllowedError");
            return getDisplayMedia.call(this, { ...constraints, audio: picked.audio ? constraints.audio : false });
        };
    })()`),G||o.contextBridge.exposeInMainWorld("EndcordDesktopNative",{app:{getVersion:()=>W,isDevBuild:()=>!1,relaunch:()=>o.ipcRenderer.invoke("EndcordDesktopRelaunch"),getIcon:()=>o.ipcRenderer.invoke("EndcordDesktopGetIcon"),setIcon:e=>o.ipcRenderer.invoke("EndcordDesktopSetIcon",e),isOutdated:()=>Promise.resolve(!1),openUpdater:()=>{}},clipboard:{copyImage:e=>o.ipcRenderer.invoke("EndcordDesktopCopyImage",e)},window:Object.fromEntries(["minimize","maximize","close"].map(e=>[e,()=>o.ipcRenderer.invoke("EndcordDesktopWindow",e)])),games:{watch(e){return o.ipcRenderer.removeAllListeners("EndcordDesktopGames"),o.ipcRenderer.on("EndcordDesktopGames",(a,r)=>e(r)),o.ipcRenderer.invoke("EndcordDesktopGamesWatch",!0)},unwatch(){return o.ipcRenderer.removeAllListeners("EndcordDesktopGames"),o.ipcRenderer.invoke("EndcordDesktopGamesWatch",!1)}}}));G||require("./endcordDesktopPreload.js");
