/* Display-only enhancement for the shared study screen. No bank/progress/auth writes. */
(function () {
  'use strict';
  const study = document.getElementById('studyView');
  if (!study || document.body.dataset.page !== 'study' || study.dataset.presentationReady) return;
  study.dataset.presentationReady = 'true';
  study.classList.add('t08-study-layout');
  let dialog = null, opener = null;

  function closeImage() {
    if (dialog && dialog.open) dialog.close();
  }
  function openImage(button, image, label) {
    if (!image.naturalWidth || typeof HTMLDialogElement === 'undefined') return;
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 't08-image-dialog';
      dialog.setAttribute('aria-labelledby', 't08ImageTitle');
      const header = document.createElement('div');
      header.className = 't08-image-header';
      const title = document.createElement('h2');
      title.id = 't08ImageTitle';
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'btn'; close.textContent = 'Close image';
      close.autofocus = true; close.addEventListener('click', closeImage);
      header.append(title, close);
      const viewport = document.createElement('div');
      viewport.className = 't08-image-viewport';
      const full = document.createElement('img');
      full.className = 't08-image-full';
      viewport.append(full); dialog.append(header, viewport); document.body.append(dialog);
      dialog.addEventListener('click', event => { if (event.target === dialog) closeImage(); });
      dialog.addEventListener('close', () => {
        full.removeAttribute('src'); full.alt = '';
        if (opener && opener.isConnected) opener.focus({preventScroll:true});
        opener = null;
      });
    }
    opener = button;
    dialog.querySelector('h2').textContent = label;
    const full = dialog.querySelector('img');
    full.alt = image.alt || label;
    full.src = image.currentSrc || image.src;
    dialog.showModal();
  }

  function figureFor(image, label, answer) {
    const figure = document.createElement('figure');
    figure.className = 't08-study-figure';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 't08-figure-open';
    button.setAttribute('aria-label', 'Enlarge ' + label.toLowerCase());
    button.setAttribute('aria-haspopup', 'dialog');
    const caption = document.createElement('figcaption');
    caption.textContent = label + ' · Tap to enlarge';
    button.append(image); figure.append(button, caption);
    button.addEventListener('click', () => openImage(button, image, label));
    function size() {
      if (!image.naturalWidth) return;
      const wide = image.naturalWidth / image.naturalHeight > 1.25;
      figure.classList.toggle('t08-wide-image', wide);
      if (answer) answer.classList.toggle('t08-wide-media', wide);
    }
    function failed() {
      if (!image.isConnected) return;
      button.disabled = true; image.hidden = true;
      caption.textContent = 'Image unavailable. Refresh From Cloud to retry.';
      figure.classList.add('t08-media-error');
    }
    image.addEventListener('load', size);
    image.addEventListener('error', failed);
    if (image.complete) {
      if (image.naturalWidth) size();
      else queueMicrotask(failed);
    }
    return figure;
  }

  function enhance() {
    if (dialog?.open && opener && !opener.isConnected) closeImage();
    study.querySelectorAll('.answer-box:not([data-t08-answer])').forEach(answer => {
      answer.dataset.t08Answer = 'true';
      const images = [...answer.children].filter(node => node.matches('img.answer-image'));
      const copy = document.createElement('div');
      copy.className = 't08-answer-copy';
      // Move existing escaped text nodes. Never reinterpret saved text as HTML or Markdown.
      for (const node of [...answer.childNodes]) if (!images.includes(node)) copy.append(node);
      const grid = document.createElement('div'); grid.className = 't08-answer-grid';
      const hasText = copy.textContent.trim().length > 0;
      if (hasText) grid.append(copy);
      answer.classList.toggle('t08-answer-with-media', images.length > 0);
      answer.classList.toggle('t08-answer-with-text', hasText);
      for (const image of images) grid.append(figureFor(image, 'Answer diagram', answer));
      const label = document.createElement('div');
      label.className = 't08-answer-label'; label.textContent = 'Answer';
      answer.append(label, grid);
    });
    study.querySelectorAll('#questionImageWrap > img.question-image').forEach(image => {
      const parent = image.parentNode;
      parent.append(figureFor(image, 'Question diagram'));
    });
  }
  // The legacy renderer replaces each card. Observe only its study region, not the whole page.
  const observer = new MutationObserver(enhance);
  observer.observe(study, {childList:true, subtree:true});
  enhance();
  window.addEventListener('pagehide', closeImage);
})();
