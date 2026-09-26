import type { AudioEngine } from "../audio/AudioEngine";
import type { LooperStore } from "../state/store";
import { el, setDisabled, toggleClass } from "./render";

export function createMixerView(engine: AudioEngine, store: LooperStore): HTMLElement {
  const root = el("section", { class: "mixer" }, [el("h2", {}, ["Layers"])]);
  const list = el("div", { class: "mixer-list" });
  root.append(list);

  function render(): void {
    const { layers } = store.getState();
    list.replaceChildren();
    if (layers.length === 0) {
      list.append(el("p", { class: "mixer-empty" }, ["No layers yet — record a loop to get started."]));
      return;
    }

    let overdubNumber = 0;
    layers.forEach((layer, index) => {
      if (!layer.isBase) overdubNumber++;
      const row = el("div", { class: "mixer-row" });
      const nameLabel = el("span", { class: "mixer-name" }, [layer.isBase ? "Base Loop" : `Overdub ${overdubNumber}`]);

      const muteBtn = el("button", { class: "control-btn small", type: "button" }, [layer.muted ? "Unmute" : "Mute"]);
      toggleClass(muteBtn, "active", layer.muted);
      muteBtn.addEventListener("click", () => engine.setLayerMuted(layer.id, !layer.muted));

      const volume = el("input", {
        type: "range",
        min: "0",
        max: "1",
        step: "0.01",
        value: String(layer.gain),
        class: "mixer-volume",
        "aria-label": `${layer.isBase ? "Base loop" : `Overdub ${overdubNumber}`} volume`,
      }) as HTMLInputElement;
      volume.addEventListener("input", () => engine.setLayerGain(layer.id, Number(volume.value)));

      const upBtn = el("button", { class: "control-btn small", type: "button" }, ["↑"]);
      const downBtn = el("button", { class: "control-btn small", type: "button" }, ["↓"]);
      const deleteBtn = el("button", { class: "control-btn small danger", type: "button" }, ["Delete"]);

      if (layer.isBase) {
        setDisabled(upBtn, true);
        setDisabled(downBtn, true);
        setDisabled(deleteBtn, true);
        deleteBtn.title = "The base loop can only be removed via Clear Loop.";
      } else {
        setDisabled(upBtn, index === 0);
        setDisabled(downBtn, index === layers.length - 1);
        upBtn.addEventListener("click", () => engine.reorderLayers(index, index - 1));
        downBtn.addEventListener("click", () => engine.reorderLayers(index, index + 1));
        deleteBtn.addEventListener("click", () => engine.removeLayer(layer.id));
      }

      row.append(nameLabel, muteBtn, volume, upBtn, downBtn, deleteBtn);
      list.append(row);
    });
  }

  store.subscribe(render);
  render();
  return root;
}
