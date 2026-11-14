document.addEventListener('DOMContentLoaded', async () => {
  const contentDiv = document.getElementById('content');
  const countSpan = document.getElementById('count');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes('youtube.com')) {
    contentDiv.textContent = 'Откройте вкладку с YouTube.';
    return;
  }

  document.body.innerHTML = `
    <h3>Новые видео <span id="count">0</span></h3>
    <div style="display: flex; gap: 6px; margin-bottom: 10px;">
      <button id="markReadBtn" style="flex: 1; padding: 6px; background: #3ea6ff; color: #0f0f0f; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Прочитать на сервере (все)</button>
    </div>
    <div id="content" class="status">Сканирование и развертывание...</div>
  `;

  const newContentDiv = document.getElementById('content');
  const newCountSpan = document.getElementById('count');
  const markReadBtn = document.getElementById('markReadBtn');

  async function scanChannels() {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          const formatStrings = document.querySelectorAll('yt-formatted-string.title');
          for (const el of formatStrings) {
            if (el.textContent.trim() === 'Развернуть') {
              const expandBtn = el.closest('tp-yt-paper-item') || el.closest('ytd-guide-entry-renderer');
              if (expandBtn) {
                expandBtn.click();
                await new Promise(r => setTimeout(r, 400));
                break;
              }
            }
          }

          const entries = document.querySelectorAll('ytd-guide-entry-renderer');
          const channelsWithDots = [];

          entries.forEach(entry => {
            const dot = entry.querySelector('#newness-dot');
            const isVisible = dot && dot.offsetParent !== null;
            const hasAttr = entry.getAttribute('line-end-style') === 'dot';

            if (isVisible || hasAttr) {
              const link = entry.querySelector('a#endpoint');
              const titleEl = entry.querySelector('yt-formatted-string.title');
              
              if (link && titleEl) {
                channelsWithDots.push({
                  name: titleEl.textContent.trim(),
                  url: link.href
                });
              }
            }
          });

          return channelsWithDots;
        }
      });

      return results[0].result;
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  let channels = await scanChannels();
  newCountSpan.textContent = channels.length;

  if (channels.length === 0) {
    newContentDiv.textContent = 'Каналов с синей точкой не найдено.';
    return;
  }

  function renderList(chList) {
    const ul = document.createElement('ul');
    ul.style.cssText = 'list-style:none; padding:0; margin:0; max-height:320px; overflow-y:auto;';

    chList.forEach(ch => {
      const li = document.createElement('li');
      li.style.marginBottom = '4px';

      const a = document.createElement('a');
      a.href = ch.url;
      a.innerHTML = `<span style="width:6px;height:6px;background:#3ea6ff;border-radius:50%;margin-right:10px;flex-shrink:0;display:inline-block;"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ch.name}</span>`;
      a.style.cssText = 'display:flex;align-items:center;padding:8px;color:#f1f1f1;text-decoration:none;border-radius:8px;';
      
      a.onmouseover = () => a.style.background = '#272727';
      a.onmouseout = () => a.style.background = 'transparent';

      a.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.update(tab.id, { url: ch.url });
        window.close();
      });

      li.appendChild(a);
      ul.appendChild(li);
    });

    newContentDiv.innerHTML = '';
    newContentDiv.appendChild(ul);
  }

  renderList(channels);

  markReadBtn.addEventListener('click', async () => {
    markReadBtn.disabled = true;
    markReadBtn.textContent = 'Обработка...';

    const currentChannels = await scanChannels();

    if (currentChannels.length === 0) {
      newCountSpan.textContent = '0';
      newContentDiv.textContent = 'Все точки уже прочитаны!';
      return;
    }

    for (const ch of currentChannels) {
      const bgTab = await chrome.tabs.create({ url: ch.url, active: false });
      await new Promise(r => setTimeout(r, 1200));
      try {
        await chrome.tabs.remove(bgTab.id);
      } catch (e) {}
    }

    await chrome.tabs.update(tab.id, { active: true });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.location.reload()
    });

    newCountSpan.textContent = '0';
    newContentDiv.innerHTML = '<div style="color: #3ea6ff; text-align: center; padding: 15px 0; font-weight: bold;">Готово! Страница обновлена, точки прочитаны на сервере.</div>';
  });
});