/** Progressive enhancement; all move and preference forms still work without scripts. */
export const DASHBOARD_SCRIPT = String.raw`
(() => {
  'use strict';
  document.querySelectorAll('.play-choices').forEach(fieldset => {
    fieldset.addEventListener('change', event => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.checked) return;
      fieldset.querySelectorAll('input[type=checkbox]').forEach(other => {
        if (other !== input && (input.name === 'play_not_now' || other.name === 'play_not_now')) other.checked = false;
      });
    });
  });
  const preferences = document.querySelector('#preferences');
  const revealPreferences = () => { if (preferences && location.hash === '#preferences') preferences.open = true; };
  revealPreferences();
  window.addEventListener('hashchange', revealPreferences);
  document.querySelector('a[href="#preferences"]')?.addEventListener('click', () => { preferences.open = true; });
  const boards = [...document.querySelectorAll('.competition-board')];
  if (!boards.length) return;
  const status = document.querySelector('#board-status');
  boards.forEach(board => {
    const key = 'competition-board:' + board.dataset.competition;
    try { if (sessionStorage.getItem(key) === 'closed') board.open = false; } catch {}
    board.addEventListener('toggle', () => {
      try { sessionStorage.setItem(key, board.open ? 'open' : 'closed'); } catch {}
    });
  });
  const laneOf = card => card.closest('[data-lane]');
  const boardOf = element => element.closest('.competition-board');
  const validTarget = (card, lane) => lane && boardOf(card) === boardOf(lane) && lane !== laneOf(card);
  const label = state => state === 'arranged' ? 'Arranged' : 'To Arrange';
  function counts() {
    document.querySelectorAll('[data-lane]').forEach(lane => {
      const count = lane.querySelectorAll('.match-card').length;
      lane.querySelector('.lane-count').textContent = '(' + count + ')';
      lane.querySelector('.board-empty').hidden = count > 0;
    });
    document.querySelectorAll('.dashboard-counts > div').forEach(stat => {
      const name = stat.querySelector('span').textContent;
      if (name === 'To arrange' || name === 'Arranged') {
        stat.querySelector('strong').textContent = document.querySelectorAll('[data-lane="' + (name === 'Arranged' ? 'arranged' : 'to_arrange') + '"] .match-card').length;
      }
    });
  }
  let saving = false;
  async function move(card, target) {
    if (saving || !validTarget(card, target)) return;
    saving = true;
    card.classList.add('saving');
    card.setAttribute('aria-busy', 'true');
    const form = card.querySelector('.move-match');
    const state = target.dataset.lane;
    status.textContent = 'Saving match…';
    try {
      const response = await fetch(form.action, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ state }), credentials: 'same-origin', redirect: 'error'
      });
      if (!response.ok) throw new Error('Save failed');
      const result = await response.json();
      if (result.state !== state) throw new Error('Save failed');
      target.append(card);
      form.querySelector('[name=state]').value = state === 'arranged' ? 'to_arrange' : 'arranged';
      form.querySelector('button').textContent = state === 'arranged' ? 'To arrange' : 'Mark arranged';
      counts();
      status.textContent = 'Match moved to ' + label(state) + '.';
    } catch {
      status.textContent = 'Could not save the move. The match stayed in its original lane. Try again or refresh to sign in.';
    } finally {
      card.classList.remove('saving');
      card.removeAttribute('aria-busy');
      saving = false;
    }
  }
  document.querySelectorAll('.move-match').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    const card = form.closest('.match-card');
    const target = boardOf(card).querySelector('[data-lane="' + form.querySelector('[name=state]').value + '"]');
    void move(card, target);
  }));
  let dragging = null;
  const clearTargets = () => document.querySelectorAll('.drop-target').forEach(lane => lane.classList.remove('drop-target'));
  document.addEventListener('dragstart', event => {
    const card = event.target.closest('.match-card');
    if (!card || saving) { if (card) event.preventDefault(); return; }
    dragging = card;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.match);
    card.classList.add('dragging');
  });
  document.addEventListener('dragover', event => {
    const lane = event.target.closest('[data-lane]');
    clearTargets();
    if (dragging && validTarget(dragging, lane)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      lane.classList.add('drop-target');
    }
  });
  document.addEventListener('drop', event => {
    if (!dragging) return;
    event.preventDefault();
    const lane = event.target.closest('[data-lane]');
    const card = dragging;
    card.classList.remove('dragging');
    dragging = null;
    clearTargets();
    if (validTarget(card, lane)) void move(card, lane);
  });
  document.addEventListener('dragend', () => {
    dragging?.classList.remove('dragging'); dragging = null; clearTargets();
  });
  // Pointer capture on the handle makes touch dragging work while the rest of the card still scrolls.
  document.querySelectorAll('.drag-handle').forEach(handle => {
    let touch = null;
    handle.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' || saving) return;
      const card = handle.closest('.match-card');
      handle.setPointerCapture(event.pointerId);
      touch = { card, id: event.pointerId, x: event.clientX, y: event.clientY, ghost: null, target: null };
    });
    handle.addEventListener('pointermove', event => {
      if (!touch || event.pointerId !== touch.id) return;
      if (!touch.ghost && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 8) return;
      if (!touch.ghost) {
        touch.ghost = touch.card.cloneNode(true);
        touch.ghost.classList.add('drag-ghost');
        touch.ghost.setAttribute('aria-hidden', 'true');
        touch.ghost.inert = true;
        touch.ghost.style.width = touch.card.getBoundingClientRect().width + 'px';
        document.body.append(touch.ghost);
        touch.card.classList.add('dragging');
      }
      touch.ghost.style.left = (event.clientX - 30) + 'px';
      touch.ghost.style.top = (event.clientY - 20) + 'px';
      const lane = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-lane]');
      touch.target = validTarget(touch.card, lane) ? lane : null;
      clearTargets(); touch.target?.classList.add('drop-target');
    });
    function finish(event, cancelled) {
      if (!touch || event.pointerId !== touch.id) return;
      const { card, ghost, target } = touch;
      touch = null; ghost?.remove(); card.classList.remove('dragging'); clearTargets();
      if (!cancelled && target) void move(card, target);
    }
    handle.addEventListener('pointerup', event => finish(event, false));
    handle.addEventListener('pointercancel', event => finish(event, true));
    handle.addEventListener('lostpointercapture', event => finish(event, true));
  });
})();
`;
