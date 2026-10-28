(() => {
  const form = document.getElementById('assistantForm');
  const input = document.getElementById('assistantInput');
  const messagesElement = document.getElementById('assistantMessages');
  const statusElement = document.getElementById('assistantStatus');
  const sendButton = document.getElementById('assistantSend');
  const newChatButton = document.getElementById('assistantNewChat');
  const voiceSelect = document.getElementById('assistantVoice');
  const speedSelect = document.getElementById('assistantSpeed');

  if (!form || !input || !messagesElement || !statusElement || !sendButton) return;

  const history = [];
  const maxHistoryMessages = 10;
  const speechAvailable = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  let availableVoices = [];
  let currentPlayback = null;
  let activeRequestController = null;
  let conversationId = 0;
  let requestPending = false;

  function detectLanguage(text) {
    const arabicCount = (text.match(/[\u0600-\u06ff]/g) || []).length;
    const latinCount = (text.match(/[A-Za-z]/g) || []).length;
    return arabicCount > latinCount ? 'ar-EG' : 'en-US';
  }

  function prepareSpeechText(markdown) {
    return markdown
      .replace(/```(?:html|css|json)\b[\s\S]*?```/gi, ' ')
      .replace(/```([\s\S]*?)```/g, ' $1 ')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')
      .replace(/<https?:\/\/[^>]+>/g, ' ')
      .replace(/\bhttps?:\/\/[^\s)]+/g, (url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return ' ';
        }
      })
      .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '')
      .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, ' ')
      .replace(/\|/g, ', ')
      .replace(/[*_~`]/g, '')
      .replace(/[•▪◦◆■►]+/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '. ')
      .trim();
  }

  function appendInline(parent, text) {
    const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_([^_]+)_|\[([^\]]+)\]\(([^)\s]+)\))/g;
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text))) {
      parent.append(document.createTextNode(text.slice(cursor, match.index)));
      const token = match[0];
      if (token.startsWith('[')) {
        const url = match[4];
        try {
          const parsedUrl = new URL(url, window.location.href);
          if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
            const link = document.createElement('a');
            link.href = parsedUrl.href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = match[3];
            parent.append(link);
          } else {
            parent.append(document.createTextNode(match[3]));
          }
        } catch {
          parent.append(document.createTextNode(match[3]));
        }
      } else {
        const strong = token.startsWith('**') || token.startsWith('__');
        const element = document.createElement(strong ? 'strong' : token.startsWith('`') ? 'code' : 'em');
        element.textContent = token.replace(/^(?:\*\*|__|`|\*|_)/, '').replace(/(?:\*\*|__|`|\*|_)$/, '');
        parent.append(element);
      }
      cursor = pattern.lastIndex;
    }

    parent.append(document.createTextNode(text.slice(cursor)));
  }

  function renderMarkdown(container, markdown) {
    const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      if (/^\s*```/.test(line)) {
        index += 1;
        const code = [];
        while (index < lines.length && !/^\s*```/.test(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        index += 1;
        const pre = document.createElement('pre');
        pre.textContent = code.join('\n');
        container.append(pre);
        continue;
      }

      const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+)$/);
      if (heading) {
        const element = document.createElement(heading[1].length <= 2 ? 'h3' : 'h4');
        appendInline(element, heading[2]);
        container.append(element);
        index += 1;
        continue;
      }

      const isTable = line.trim().startsWith('|') && index + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1]);
      if (isTable) {
        const rows = [line];
        index += 2;
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          rows.push(lines[index]);
          index += 1;
        }
        const table = document.createElement('table');
        rows.forEach((row, rowIndex) => {
          const tr = document.createElement('tr');
          const cells = row.split('|').slice(1, -1);
          cells.forEach((cell) => {
            const element = document.createElement(rowIndex === 0 ? 'th' : 'td');
            if (rowIndex === 0) element.scope = 'col';
            appendInline(element, cell.trim());
            tr.append(element);
          });
          table.append(tr);
        });
        container.append(table);
        continue;
      }

      const listMatch = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
      if (listMatch) {
        const ordered = Boolean(listMatch[2]);
        const list = document.createElement(ordered ? 'ol' : 'ul');
        while (index < lines.length) {
          const item = lines[index].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
          if (!item || Boolean(item[2]) !== ordered) break;
          const listItem = document.createElement('li');
          appendInline(listItem, item[3]);
          list.append(listItem);
          index += 1;
        }
        container.append(list);
        continue;
      }

      const paragraph = document.createElement('p');
      const paragraphLines = [];
      while (index < lines.length && lines[index].trim() &&
        !/^\s*(?:#{1,4}\s|```|[-*+]\s|\d+[.)]\s)/.test(lines[index])) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      if (!paragraphLines.length) {
        paragraphLines.push(lines[index].trim());
        index += 1;
      }
      appendInline(paragraph, paragraphLines.join(' '));
      container.append(paragraph);
    }
  }

  function addMessage(text, role, options = {}) {
    const card = document.createElement('article');
    const language = detectLanguage(text);
    card.className = `assistant-message ${role === 'user' ? 'assistant-message-user' : 'assistant-message-ai'}`;
    card.dir = language.startsWith('ar') ? 'rtl' : 'ltr';
    card.lang = language.startsWith('ar') ? 'ar' : 'en';

    const content = document.createElement('div');
    if (role === 'user') {
      const paragraph = document.createElement('p');
      paragraph.textContent = text;
      content.append(paragraph);
    } else {
      renderMarkdown(content, text);
    }
    card.append(content);

    if (role === 'assistant' && options.speech !== false) {
      addSpeechControls(card, text, language);
    }

    messagesElement.append(card);
    messagesElement.scrollTop = messagesElement.scrollHeight;
    return card;
  }

  function getNativeVoice(language) {
    if (!speechAvailable) return null;
    const selected = voiceSelect?.value;
    if (selected && selected !== 'auto') {
      const chosen = availableVoices.find((voice) => voice.voiceURI === selected);
      if (chosen && chosen.lang.toLowerCase().startsWith(language.slice(0, 2))) return chosen;
    }

    const languageVoices = availableVoices.filter((voice) =>
      voice.lang.toLowerCase().startsWith(language.slice(0, 2))
    );
    if (language.startsWith('ar')) {
      return languageVoices.find((voice) => voice.lang.toLowerCase().startsWith('ar-eg')) ||
        languageVoices[0] || null;
    }
    return languageVoices.find((voice) => voice.lang.toLowerCase().startsWith('en-us')) ||
      languageVoices[0] || null;
  }

  function updateVoiceList() {
    if (!speechAvailable || !voiceSelect) return;
    const previousValue = voiceSelect.value;
    availableVoices = window.speechSynthesis.getVoices();
    const options = availableVoices
      .filter((voice) => /^(ar|en)(-|$)/i.test(voice.lang))
      .slice(0, 80);

    voiceSelect.replaceChildren(new Option('تلقائي حسب اللغة', 'auto'));
    options.forEach((voice) => {
      voiceSelect.add(new Option(`${voice.name} (${voice.lang})`, voice.voiceURI));
    });
    if ([...voiceSelect.options].some((option) => option.value === previousValue)) {
      voiceSelect.value = previousValue;
    }
    voiceSelect.disabled = options.length === 0;
  }

  function setPlaybackStatus(card, text, isError = false) {
    const status = card.querySelector('.speech-status');
    if (status) {
      status.textContent = text;
      status.classList.toggle('assistant-error', isError);
    }
  }

  function setPlaybackButtons(state, paused) {
    state.pauseButton.textContent = paused ? 'استئناف' : 'إيقاف مؤقت';
    state.pauseButton.setAttribute('aria-label', paused ? 'استئناف القراءة' : 'إيقاف القراءة مؤقتًا');
    state.pauseButton.disabled = false;
    state.stopButton.disabled = false;
  }

  function releaseAudio(state) {
    if (state.audio) {
      state.audio.onended = null;
      state.audio.onerror = null;
      state.audio.pause();
      state.audio.removeAttribute('src');
      state.audio.load();
      state.audio = null;
    }
    if (state.objectUrl) {
      URL.revokeObjectURL(state.objectUrl);
      state.objectUrl = null;
    }
    if (state.progress) {
      state.progress.hidden = true;
      state.progress.value = '0';
    }
    if (state.duration) {
      state.duration.hidden = true;
      state.duration.textContent = '';
    }
  }

  function clearPlayback(state, statusText) {
    if (state.kind === 'native' && speechAvailable) window.speechSynthesis.cancel();
    releaseAudio(state);
    state.cancelled = true;
    state.kind = null;
    state.pauseButton.disabled = true;
    state.stopButton.disabled = true;
    if (statusText) setPlaybackStatus(state.card, statusText);
    if (currentPlayback === state) currentPlayback = null;
  }

  function stopCurrent(statusText = 'تم إيقاف القراءة.') {
    if (currentPlayback) clearPlayback(currentPlayback, statusText);
  }

  function splitSpeechText(text, maxLength = 240) {
    const sentences = text.match(/[^.!?؟۔\n]+[.!?؟۔\n]*/g) || [text];
    const chunks = [];
    sentences.forEach((sentence) => {
      let remaining = sentence.trim();
      while (remaining.length > maxLength) {
        let boundary = remaining.lastIndexOf(' ', maxLength);
        if (boundary < maxLength * 0.55) boundary = maxLength;
        chunks.push(remaining.slice(0, boundary).trim());
        remaining = remaining.slice(boundary).trim();
      }
      if (remaining) chunks.push(remaining);
    });
    return chunks;
  }

  function speakNative(state) {
    if (!speechAvailable) {
      setPlaybackStatus(state.card, 'هذا المتصفح لا يدعم القراءة الصوتية.', true);
      clearPlayback(state);
      return;
    }

    const chunks = splitSpeechText(state.text);
    const voice = getNativeVoice(state.language);
    const voiceName = voice ? voice.name : state.language.startsWith('ar') ? 'صوت عربي متاح بالمتصفح' : 'صوت إنجليزي متاح بالمتصفح';
    state.kind = 'native';
    state.utterances = chunks.map((chunk) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = state.language;
      utterance.rate = Number(speedSelect?.value || 1);
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (state.cancelled || currentPlayback !== state) return;
        state.index += 1;
        if (state.index < state.utterances.length) {
          window.speechSynthesis.speak(state.utterances[state.index]);
        } else {
          setPlaybackStatus(state.card, `اكتملت القراءة — ${voiceName}.`);
          state.pauseButton.disabled = true;
          state.stopButton.disabled = true;
          currentPlayback = null;
        }
      };
      utterance.onerror = (event) => {
        if (state.cancelled || currentPlayback !== state || event.error === 'canceled') return;
        setPlaybackStatus(state.card, 'تعذرت القراءة الصوتية في هذا المتصفح.', true);
        clearPlayback(state);
      };
      return utterance;
    });

    if (!chunks.length) {
      setPlaybackStatus(state.card, 'لا يوجد نص صالح للقراءة.', true);
      clearPlayback(state);
      return;
    }
    setPlaybackStatus(state.card, `قراءة المتصفح — ${voiceName} (${state.language}).`);
    setPlaybackButtons(state, false);
    window.speechSynthesis.speak(state.utterances[0]);
  }

  async function tryPremiumSpeech(state) {
    if (state.premiumUnavailable || state.text.length > 8000) return false;
    const response = await fetch('/.netlify/functions/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: state.text, language: state.language }),
    });

    if (response.status === 404) {
      state.premiumUnavailable = true;
      return false;
    }
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        // Use the generic error below for non-JSON responses.
      }
      if (response.status === 503 && payload?.error?.code === 'tts_not_configured') {
        state.premiumUnavailable = true;
        return false;
      }
      throw new Error(payload?.error?.message || 'تعذر إنشاء الصوت المميز. حاول مرة أخرى لاحقًا.');
    }

    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith('audio/')) {
      throw new Error('أعاد مزود الصوت ملفًا غير صالح.');
    }

    state.objectUrl = URL.createObjectURL(blob);
    state.audio = new Audio(state.objectUrl);
    state.audio.playbackRate = Number(speedSelect?.value || 1);
    state.kind = 'premium';
    state.progress.hidden = false;
    state.duration.hidden = false;
    const updateProgress = () => {
      const length = Number.isFinite(state.audio?.duration) ? state.audio.duration : 0;
      const position = Number.isFinite(state.audio?.currentTime) ? state.audio.currentTime : 0;
      state.progress.max = String(length);
      state.progress.value = String(position);
      state.duration.textContent = `${formatTime(position)} / ${formatTime(length)}`;
    };
    state.audio.addEventListener('loadedmetadata', updateProgress);
    state.audio.addEventListener('timeupdate', updateProgress);
    state.audio.onended = () => {
      if (state.cancelled || currentPlayback !== state) return;
      setPlaybackStatus(state.card, 'اكتملت القراءة الصوتية المميزة.');
      state.pauseButton.disabled = true;
      state.stopButton.disabled = true;
    };
    state.audio.onerror = () => {
      if (state.cancelled || currentPlayback !== state) return;
      setPlaybackStatus(state.card, 'حدث خطأ أثناء تشغيل الصوت.', true);
      clearPlayback(state);
    };
    setPlaybackStatus(state.card, 'قراءة بالصوت العصبي المميز.');
    setPlaybackButtons(state, false);
    try {
      await state.audio.play();
    } catch (error) {
      if (error.name === 'NotAllowedError') {
        releaseAudio(state);
        state.kind = null;
        return false;
      }
      throw error;
    }
    return true;
  }

  async function startPlayback(state) {
    if (state.starting) return;
    if (currentPlayback && currentPlayback !== state) {
      stopCurrent('أُوقفت قراءة الإجابة السابقة.');
    } else if (currentPlayback === state && state.kind === 'native' && speechAvailable) {
      window.speechSynthesis.cancel();
    }
    currentPlayback = state;
    state.starting = true;
    state.cancelled = false;
    state.index = 0;
    state.pauseButton.disabled = true;
    state.stopButton.disabled = true;
    setPlaybackStatus(state.card, 'جارٍ تجهيز الصوت…');

    try {
      if (state.kind === 'premium' && state.audio) {
        state.audio.currentTime = 0;
        setPlaybackStatus(state.card, 'إعادة تشغيل الصوت العصبي المميز.');
        setPlaybackButtons(state, false);
        await state.audio.play();
        return;
      }
      const premiumStarted = await tryPremiumSpeech(state);
      if (state.cancelled || currentPlayback !== state) return;
      if (!premiumStarted) {
        setPlaybackStatus(state.card, speechAvailable
          ? 'الصوت العصبي غير مُعدّ؛ جارٍ استخدام صوت المتصفح.'
          : 'الصوت العصبي غير مُعدّ، ولا يتوفر دعم صوتي في هذا المتصفح.', !speechAvailable);
        if (speechAvailable) speakNative(state);
      }
    } catch (error) {
      if (state.cancelled || currentPlayback !== state) return;
      setPlaybackStatus(state.card, error.message || 'تعذر بدء القراءة الصوتية.', true);
      clearPlayback(state);
    } finally {
      state.starting = false;
    }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function addSpeechControls(card, text, language) {
    const preparedText = prepareSpeechText(text);
    const meta = document.createElement('div');
    meta.className = 'assistant-message-meta';
    const controls = document.createElement('div');
    controls.className = 'speech-controls';
    const playButton = document.createElement('button');
    playButton.type = 'button';
    playButton.className = 'button secondary small';
    playButton.textContent = 'قراءة';
    playButton.setAttribute('aria-label', language.startsWith('ar') ? 'قراءة هذه الإجابة' : 'Read this response aloud');
    const pauseButton = document.createElement('button');
    pauseButton.type = 'button';
    pauseButton.className = 'button ghost small';
    pauseButton.textContent = 'إيقاف مؤقت';
    pauseButton.disabled = true;
    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'button ghost small';
    stopButton.textContent = 'إيقاف';
    stopButton.disabled = true;
    const replayButton = document.createElement('button');
    replayButton.type = 'button';
    replayButton.className = 'button ghost small';
    replayButton.textContent = 'إعادة';
    replayButton.setAttribute('aria-label', language.startsWith('ar') ? 'إعادة قراءة هذه الإجابة' : 'Replay this response');
    const progress = document.createElement('input');
    progress.type = 'range';
    progress.className = 'speech-progress';
    progress.min = '0';
    progress.max = '0';
    progress.step = '0.1';
    progress.value = '0';
    progress.hidden = true;
    progress.setAttribute('aria-label', language.startsWith('ar') ? 'موضع الصوت' : 'Audio position');
    const duration = document.createElement('span');
    duration.className = 'speech-duration';
    duration.hidden = true;
    const status = document.createElement('span');
    status.className = 'speech-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    controls.append(playButton, pauseButton, stopButton, replayButton, progress, duration);
    meta.append(controls, status);
    card.append(meta);

    const state = {
      card,
      text: preparedText,
      language,
      playButton,
      pauseButton,
      stopButton,
      audio: null,
      objectUrl: null,
      cancelled: false,
      starting: false,
      premiumUnavailable: preparedText.length > 8000,
      progress,
      duration,
    };

    playButton.addEventListener('click', () => {
      if (!preparedText) {
        setPlaybackStatus(card, 'لا يوجد نص صالح للقراءة.', true);
        return;
      }
      startPlayback(state);
    });

    pauseButton.addEventListener('click', () => {
      if (currentPlayback !== state) return;
      if (state.kind === 'premium' && state.audio) {
        if (state.audio.paused) {
          state.audio.play().then(() => setPlaybackButtons(state, false)).catch(() => {
            setPlaybackStatus(card, 'تعذر استئناف تشغيل الصوت.', true);
          });
        } else {
          state.audio.pause();
          setPlaybackButtons(state, true);
        }
      } else if (speechAvailable) {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
          setPlaybackButtons(state, false);
        } else {
          window.speechSynthesis.pause();
          setPlaybackButtons(state, true);
        }
      }
    });

    stopButton.addEventListener('click', () => {
      if (currentPlayback === state) clearPlayback(state, 'تم إيقاف القراءة.');
    });

    replayButton.addEventListener('click', () => startPlayback(state));

    progress.addEventListener('input', () => {
      if (currentPlayback === state && state.audio && Number.isFinite(state.audio.duration)) {
        state.audio.currentTime = Number(progress.value);
      }
    });
  }

  function collectWebsiteContext() {
    const sections = [...document.querySelectorAll('main section:not(#assistant)')];
    return sections.map((section) => section.innerText.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 8000);
  }

  function setRequestPending(pending) {
    requestPending = pending;
    sendButton.disabled = pending;
    sendButton.textContent = pending ? 'جارٍ الإرسال…' : 'إرسال';
    input.disabled = pending;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || requestPending) return;

    statusElement.textContent = '';
    input.value = '';
    history.push({ role: 'user', content: message });
    if (history.length > maxHistoryMessages) history.splice(0, history.length - maxHistoryMessages);
    addMessage(message, 'user', { speech: false });
    setRequestPending(true);

    const controller = new AbortController();
    activeRequestController = controller;
    const requestConversationId = conversationId;
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          messages: history,
          context: collectWebsiteContext(),
        }),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('استجابة غير صالحة من خدمة المساعد.');
      }
      if (!response.ok) {
        throw new Error(result?.error?.message || 'تعذر إكمال الطلب. حاول مرة أخرى لاحقًا.');
      }
      if (typeof result.reply !== 'string' || !result.reply.trim()) {
        throw new Error('لم تُرجع خدمة المساعد إجابة صالحة.');
      }
      if (requestConversationId !== conversationId) return;
      history.push({ role: 'assistant', content: result.reply });
      if (history.length > maxHistoryMessages) history.splice(0, history.length - maxHistoryMessages);
      addMessage(result.reply, 'assistant');
    } catch (error) {
      if (requestConversationId !== conversationId) return;
      const messageText = error.name === 'AbortError'
        ? 'استغرق الطلب وقتًا أطول من المتوقع. تحقق من الاتصال وحاول مجددًا.'
        : error.message || 'تعذر الاتصال بخدمة المساعد. حاول مرة أخرى لاحقًا.';
      statusElement.textContent = messageText;
    } finally {
      window.clearTimeout(timeout);
      if (activeRequestController === controller) activeRequestController = null;
      if (requestConversationId === conversationId) {
        setRequestPending(false);
        input.focus();
      }
    }
  });

  newChatButton?.addEventListener('click', () => {
    conversationId += 1;
    activeRequestController?.abort();
    activeRequestController = null;
    setRequestPending(false);
    stopCurrent('تم إيقاف القراءة.');
    history.length = 0;
    messagesElement.replaceChildren();
    const welcome = document.createElement('article');
    welcome.className = 'assistant-message assistant-message-welcome';
    welcome.lang = 'ar';
    welcome.dir = 'rtl';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'بدأت محادثة جديدة. اسأل عن المعلومات المعروضة في هذه البوابة.';
    welcome.append(paragraph);
    messagesElement.append(welcome);
    statusElement.textContent = '';
    input.value = '';
    input.focus();
  });

  speedSelect?.addEventListener('change', () => {
    if (!currentPlayback) return;
    const rate = Number(speedSelect.value);
    if (currentPlayback.kind === 'premium' && currentPlayback.audio) {
      currentPlayback.audio.playbackRate = rate;
    } else if (currentPlayback.kind === 'native') {
      currentPlayback.utterances?.forEach((utterance) => {
        utterance.rate = rate;
      });
    }
  });

  if (speechAvailable) {
    updateVoiceList();
    window.speechSynthesis.onvoiceschanged = updateVoiceList;
  } else if (voiceSelect) {
    voiceSelect.disabled = true;
    voiceSelect.title = 'القراءة الأصلية غير مدعومة في هذا المتصفح.';
  }
})();
