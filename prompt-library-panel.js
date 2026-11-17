(function (root) {
  "use strict";
  const labels = { image: "生图", imageVideo: "图文生视频", multiVideo: "多模态生视频", motion: "动作模仿", avatar: "数字人", viduRef: "参考生视频" };
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function createPanel({ client, copyText }) {
    let context = null;
    let page = 1;
    let favoriteOnly = false;
    let composing = false;
    let searchTimer = 0;
    let busy = false;
    const dialog = document.createElement("dialog");
    dialog.className = "prompt-library-dialog";
    dialog.innerHTML = `<div class="prompt-library-shell">
      <header class="prompt-library-header"><h2 data-library-title>提示词库</h2><button type="button" class="button" data-library-close>关闭</button></header>
      <div class="prompt-library-toolbar"><input type="search" data-library-search placeholder="搜索提示词" aria-label="搜索提示词"><label class="inline-check"><input type="checkbox" data-library-favorites>仅看收藏</label><button type="button" class="tiny-button" data-library-save>收藏当前提示词</button></div>
      <div class="prompt-library-status meta-line" data-library-status role="status"></div>
      <div class="prompt-library-list" data-library-list></div>
      <footer class="prompt-library-footer"><button type="button" class="tiny-button" data-library-prev aria-label="上一页">←</button><span data-library-page></span><button type="button" class="tiny-button" data-library-next aria-label="下一页">→</button></footer>
    </div>`;
    document.body.appendChild(dialog);
    const list = dialog.querySelector("[data-library-list]");
    const search = dialog.querySelector("[data-library-search]");
    const status = dialog.querySelector("[data-library-status]");
    const taskType = () => context.type === "multi" ? "multiVideo" : context.type;
    const entries = () => client.getEntries(taskType(), { search: search.value, favoriteOnly });
    function renderList() {
      if (!context || !dialog.open || composing) return;
      const all = root.PromptLibrary.searchEntries(entries(), search.value).filter(item => !favoriteOnly || item.favorite);
      const pages = Math.max(1, Math.ceil(all.length / 20));
      page = Math.max(1, Math.min(page, pages));
      const locked = context.isLocked();
      list.innerHTML = all.slice((page - 1) * 20, page * 20).map(item => `<article class="prompt-library-item" data-key="${escape(item.key)}">
        <div class="prompt-library-item-head"><span class="meta-line">${item.usedAt ? escape(new Date(item.usedAt).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })) : "已收藏"}${item.model ? ` · ${escape(item.model)}` : ""}</span><button class="favorite-button ${item.favorite ? "active" : ""}" type="button" data-library-star title="${item.favorite ? "取消收藏" : "收藏"}" aria-label="${item.favorite ? "取消收藏" : "收藏"}" aria-pressed="${!!item.favorite}">${item.favorite ? "★" : "☆"}</button></div>
        <div class="prompt-library-text">${escape(item.text)}</div>
        <div class="prompt-library-actions"><button class="tiny-button" type="button" data-library-copy>复制</button><button class="tiny-button" type="button" data-library-apply ${locked ? "disabled" : ""}>填入当前行</button><button class="tiny-button" type="button" data-library-expand>展开</button></div>
      </article>`).join("") || `<div class="meta-line">${search.value.trim() ? "没有匹配的提示词" : favoriteOnly ? "暂无收藏" : "暂无历史提示词"}</div>`;
      dialog.querySelector("[data-library-page]").textContent = `${page} / ${pages} · ${all.length} 条`;
      dialog.querySelector("[data-library-prev]").disabled = page === 1;
      dialog.querySelector("[data-library-next]").disabled = page === pages;
      dialog.querySelector("[data-library-save]").disabled = !String(context.row.prompt || "").trim() || busy;
    }
    async function perform(operation) {
      if (busy) return;
      busy = true;
      try { await operation(); status.textContent = "已保存"; }
      catch (error) { status.textContent = `保存失败：${error.message}`; }
      finally { busy = false; renderList(); }
    }
    dialog.querySelector("[data-library-close]").onclick = () => dialog.close();
    dialog.addEventListener("close", () => { context = null; clearTimeout(searchTimer); });
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    search.addEventListener("compositionstart", () => { composing = true; clearTimeout(searchTimer); });
    search.addEventListener("compositionend", () => { composing = false; page = 1; renderList(); });
    search.addEventListener("input", () => {
      if (composing) return;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { page = 1; renderList(); list.scrollTop = 0; }, 150);
    });
    dialog.querySelector("[data-library-favorites]").onchange = event => { favoriteOnly = event.target.checked; page = 1; renderList(); };
    dialog.querySelector("[data-library-prev]").onclick = () => { page--; renderList(); list.scrollTop = 0; };
    dialog.querySelector("[data-library-next]").onclick = () => { page++; renderList(); list.scrollTop = 0; };
    dialog.querySelector("[data-library-save]").onclick = () => {
      const savedContext = context;
      const type = taskType();
      const text = String(savedContext.row.prompt || "");
      perform(async () => {
        const entry = await client.record(type, text, { model: savedContext.row.model });
        await client.setFavorite(type, entry.key, true);
      });
    };
    list.addEventListener("click", event => {
      const card = event.target.closest("[data-key]");
      if (!card || !context) return;
      const entry = client.getEntries(taskType()).find(item => item.key === card.dataset.key);
      if (!entry) return;
      if (event.target.closest("[data-library-star]")) {
        const type = taskType();
        perform(() => client.setFavorite(type, entry.key, !entry.favorite));
      } else if (event.target.closest("[data-library-copy]")) {
        copyText(entry.text);
      } else if (event.target.closest("[data-library-expand]")) {
        const expanded = card.classList.toggle("expanded");
        event.target.textContent = expanded ? "收起" : "展开";
      } else if (event.target.closest("[data-library-apply]")) {
        if (context.isLocked()) { status.textContent = "任务处理中，暂不能修改提示词"; renderList(); return; }
        if (context.updatePrompt(entry.text)) { context.persist(); context.afterApply?.(); dialog.close(); }
      }
    });
    client.onChange(() => renderList());
    return {
      async open(nextContext) {
        context = nextContext;
        page = 1;
        search.value = "";
        dialog.querySelector("[data-library-title]").textContent = `${labels[taskType()] || ""} · 提示词库`;
        status.textContent = "正在读取…";
        if (!dialog.open) dialog.showModal();
        const requestedContext = context;
        try {
          await client.ready;
          if (context !== requestedContext) return;
          status.textContent = "";
          renderList();
          client.sync(taskType()).catch(() => { if (dialog.open) status.textContent = "本地记录可用，等待同步"; });
        } catch (error) { status.textContent = `读取失败：${error.message}`; }
      }
    };
  }
  root.PromptLibraryPanel = { createPanel };
})(globalThis);
