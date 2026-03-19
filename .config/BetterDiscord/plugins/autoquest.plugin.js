/**
 * @name Auto Quest
 * @author _void_x_
 * @description Automatically complete your discord quests.
 * @version 0.0.1
 * @authorId 1375746430110797906
 */

module.exports = () => {
    let button;
    let buttonText;
    let isRunning = false;
    let activePatches = [];
    let activeSubscriptions = [];

    const createButton = () => {
        buttonText = document.createElement("span");
        buttonText.textContent = "Auto Quests";
        buttonText.className = "lineClamp1__4bd52 text-sm/medium_cf4812";
        buttonText.dataset.textVariant = "text-sm/medium";

        const btnTxtContainer = document.createElement("div");
        btnTxtContainer.className = "buttonChildren_a22cb0";
        btnTxtContainer.append(buttonText);

        const btnWrapper = document.createElement("div");
        btnWrapper.className = "buttonChildrenWrapper_a22cb0";
        btnWrapper.append(btnTxtContainer);

        const btn = document.createElement("button");
        btn.id = "auto-quest-btn";
        btn.dataset.manaComponent = "button";
        btn.role = "button";
        btn.className = "button_a22cb0 sm_a22cb0 secondary_a22cb0 hasText_a22cb0";
        btn.type = "button";
        btn.append(btnWrapper);
        btn.addEventListener("click", () => {
            if (!isRunning) startSpoofing();
        });

        return btn;
    };

    const setButtonState = (running) => {
        isRunning = running;
        if (button) {
            button.disabled = running;
            if (buttonText) {
                buttonText.textContent = running ? "Spoofing..." : "Auto Quests";
            }
        }
    };

    const cleanup = () => {
        while (activePatches.length) {
            const { object, method, original } = activePatches.pop();
            object[method] = original;
        }
        while (activeSubscriptions.length) {
            const { dispatcher, event, callback } = activeSubscriptions.pop();
            dispatcher.unsubscribe(event, callback);
        }
    };

    const startSpoofing = () => {
        delete window.$;
        let wpRequire;
        try {
            wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
            webpackChunkdiscord_app.pop();
        } catch (e) {
            BdApi.UI.showToast("Failed to access Discord internals", { type: "error" });
            return;
        }

        const findModule = (filter) => {
            for (const i in wpRequire.c) {
                if (filter(wpRequire.c[i].exports)) return wpRequire.c[i].exports;
            }
        };

        const ApplicationStreamingStore = findModule(m => m?.A?.__proto__?.getStreamerActiveStreamMetadata)?.A;
        const RunningGameStore = findModule(m => m?.Ay?.getRunningGames)?.Ay;
        const QuestsStore = findModule(m => m?.A?.__proto__?.getQuest)?.A;
        const ChannelStore = findModule(m => m?.A?.__proto__?.getAllThreadsForParent)?.A;
        const GuildChannelStore = findModule(m => m?.Ay?.getSFWDefaultChannel)?.Ay;
        const FluxDispatcher = findModule(m => m?.h?.__proto__?.flushWaitQueue)?.h;
        const api = findModule(m => m?.Bo?.get)?.Bo;

        if (!QuestsStore || !RunningGameStore || !FluxDispatcher || !api) {
            BdApi.UI.showToast("Could not find required Discord modules", { type: "error" });
            return;
        }

        const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];
        let quests = [...QuestsStore.quests.values()].filter(x =>
            x.userStatus?.enrolledAt &&
            !x.userStatus?.completedAt &&
            new Date(x.config.expiresAt).getTime() > Date.now() &&
            supportedTasks.find(y => Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y))
        );

        if (quests.length === 0) {
            BdApi.UI.showToast("No uncompleted quests found!", { type: "info" });
            return;
        }

        setButtonState(true);
        BdApi.UI.showToast(`Starting spoofing for ${quests.length} quests`, { type: "info" });

        const isApp = typeof DiscordNative !== "undefined";

        const doJob = async () => {
            const quest = quests.pop();
            if (!quest) {
                setButtonState(false);
                BdApi.UI.showToast("All tasks completed!", { type: "success" });
                return;
            }

            const pid = Math.floor(Math.random() * 30000) + 1000;
            const applicationId = quest.config.application.id;
            const applicationName = quest.config.application.name;
            const questName = quest.config.messages.questName;
            const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
            const taskName = supportedTasks.find(x => taskConfig.tasks[x] != null);
            const secondsNeeded = taskConfig.tasks[taskName].target;
            let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;

            if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
                const maxFuture = 10, speed = 7, interval = 1;
                const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
                let completed = false;

                BdApi.UI.showToast(`Spoofing video for ${questName}...`, { type: "info" });

                while (isRunning) {
                    const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
                    const diff = maxAllowed - secondsDone;
                    const timestamp = secondsDone + speed;
                    if (diff >= speed) {
                        try {
                            const res = await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) } });
                            completed = res.body.completed_at != null;
                            secondsDone = Math.min(secondsNeeded, timestamp);
                        } catch (e) {
                            console.error("Video spoofing error:", e);
                        }
                    }

                    if (timestamp >= secondsNeeded || completed) break;
                    await new Promise(resolve => setTimeout(resolve, interval * 1000));
                }

                if (isRunning && !completed) {
                    await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: secondsNeeded } });
                }

                BdApi.UI.showToast(`Completed ${questName}!`, { type: "success" });
                if (isRunning) doJob();
            } else if (taskName === "PLAY_ON_DESKTOP") {
                if (!isApp) {
                    BdApi.UI.showNotice(`Quest "${questName}" requires the Discord Desktop App.`, { type: "warning", buttons: [{ label: "Dismiss", onClick: () => { } }] });
                    if (isRunning) doJob();
                } else {
                    api.get({ url: `/applications/public?application_ids=${applicationId}` }).then(res => {
                        const appData = res.body[0];
                        const exeName = appData.executables?.find(x => x.os === "win32")?.name?.replace(">", "") ?? appData.name.replace(/[\/\\:*?"<>|]/g, "");

                        const fakeGame = {
                            cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
                            exeName,
                            exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
                            hidden: false,
                            isLauncher: false,
                            id: applicationId,
                            name: appData.name,
                            pid: pid,
                            pidPath: [pid],
                            processName: appData.name,
                            start: Date.now(),
                        };

                        const realGames = RunningGameStore.getRunningGames();
                        const fakeGames = [fakeGame];
                        const realGetRunningGames = RunningGameStore.getRunningGames;
                        const realGetGameForPID = RunningGameStore.getGameForPID;

                        RunningGameStore.getRunningGames = () => fakeGames;
                        RunningGameStore.getGameForPID = (p) => fakeGames.find(x => x.pid === p);

                        activePatches.push({ object: RunningGameStore, method: "getRunningGames", original: realGetRunningGames });
                        activePatches.push({ object: RunningGameStore, method: "getGameForPID", original: realGetGameForPID });

                        FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: fakeGames });

                        const onHeartbeat = data => {
                            if (data.questId !== quest.id) return;
                            let progress = quest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);

                            if (progress >= secondsNeeded) {
                                cleanup();
                                FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                                BdApi.UI.showToast(`Completed ${questName}!`, { type: "success" });
                                if (isRunning) doJob();
                            }
                        };

                        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", onHeartbeat);
                        activeSubscriptions.push({ dispatcher: FluxDispatcher, event: "QUESTS_SEND_HEARTBEAT_SUCCESS", callback: onHeartbeat });

                        BdApi.UI.showToast(`Spoofed ${applicationName}. Wait ~${Math.ceil((secondsNeeded - secondsDone) / 60)} mins.`, { type: "info" });
                    });
                }
            } else if (taskName === "STREAM_ON_DESKTOP") {
                if (!isApp) {
                    BdApi.UI.showNotice(`Quest "${questName}" requires the Discord Desktop App.`, { type: "warning" });
                    if (isRunning) doJob();
                } else {
                    const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
                    ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
                        id: applicationId,
                        pid,
                        sourceName: null
                    });

                    activePatches.push({ object: ApplicationStreamingStore, method: "getStreamerActiveStreamMetadata", original: realFunc });

                    const onHeartbeat = data => {
                        if (data.questId !== quest.id) return;
                        let progress = quest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);

                        if (progress >= secondsNeeded) {
                            cleanup();
                            BdApi.UI.showToast(`Completed ${questName}!`, { type: "success" });
                            if (isRunning) doJob();
                        }
                    };

                    FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", onHeartbeat);
                    activeSubscriptions.push({ dispatcher: FluxDispatcher, event: "QUESTS_SEND_HEARTBEAT_SUCCESS", callback: onHeartbeat });

                    BdApi.UI.showToast(`Streaming spoofed to ${applicationName}. Join VC with someone for ~${Math.ceil((secondsNeeded - secondsDone) / 60)} mins.`, { type: "info" });
                }
            } else if (taskName === "PLAY_ACTIVITY") {
                const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ?? Object.values(GuildChannelStore.getAllGuilds()).find(x => x != null && x.VOCAL?.length > 0)?.VOCAL[0].channel.id;
                const streamKey = `call:${channelId}:1`;

                BdApi.UI.showToast(`Completing ${questName} via activity spoofing...`, { type: "info" });

                const runActivity = async () => {
                    while (isRunning) {
                        try {
                            const res = await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: false } });
                            const progress = res.body.progress.PLAY_ACTIVITY.value;

                            if (progress >= secondsNeeded) {
                                await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: true } });
                                BdApi.UI.showToast(`Completed ${questName}!`, { type: "success" });
                                break;
                            }
                        } catch (e) {
                            console.error("Activity spoofing error:", e);
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 20 * 1000));
                    }
                    if (isRunning) doJob();
                };
                runActivity();
            }
        };

        doJob();
    };

    const injectButton = () => {
        const target = document.querySelector(".headingControls__57454");
        if (!target || target.querySelector("#auto-quest-btn")) return;

        if (!button) {
            button = createButton();
        }

        target.append(button);
    };

    return {
        start() {
            injectButton();
        },
        stop() {
            isRunning = false;
            cleanup();
            if (button) button.remove();
            button = null;
        },
        onSwitch() {
            injectButton();
        }
    };
};

