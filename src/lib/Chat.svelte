<script>
  import { callProcessEntry } from './supabase.js';
  import { profile, handleGamificationUpdate } from './stores.svelte.js';
  import { offlineQueue, enqueueEntry, flushQueue, initOfflineQueue } from './offlineQueue.svelte.js';

  let { selectedDate = $bindable(), onEntryLogged = () => {} } = $props();

  // Init offline queue on first mount
  $effect(() => { initOfflineQueue(); });

  let open = $state(false);
  let input = $state('');
  let chatDate = $state(selectedDate || new Date().toISOString().split('T')[0]);
  let messages = $state([
    { text: `Olá${profile.data?.name ? ', ' + profile.data.name : ''}! Estou aqui para te ajudar a alcançar seus objetivos de saúde.\n\nO que deseja registrar?\n\n• Refeições\n• Água\n• Sono\n• Saúde\n\nÉ só descrever e eu cuido do resto!`, side: 'bot' },
  ]);
  let sending = $state(false);

  function toggle() {
    open = !open;
    if (open && selectedDate) chatDate = selectedDate;
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    if (text.length < 2) {
      messages.push({ text: '⚠️ Mensagem muito curta. Descreva sua refeição, sono ou saúde.', side: 'bot', error: true });
      return;
    }
    if (sending) return;

    await sendMessage(text);
  }

  async function sendMessage(text) {
    messages.push({ text, side: 'user' });
    input = '';
    sending = true;

    const statusIdx = messages.length;
    messages.push({ text: '⏳ Processando com IA...', side: 'bot', status: true });

    try {
      const result = await callProcessEntry(text, chatDate);

      if (result.success) {
        messages[statusIdx] = { text: result.message, side: 'bot', success: true };

        // Handle gamification updates (streak, badges, XP)
        if (result.gamification) {
          handleGamificationUpdate(result.gamification);

          // Show badge notifications in chat
          if (result.gamification.badgesUnlocked?.length > 0) {
            for (const badge of result.gamification.badgesUnlocked) {
              messages.push({
                text: `🏆 Conquista desbloqueada: ${badge.icon} ${badge.name} (+${badge.xp} XP)`,
                side: 'bot',
                success: true,
              });
            }
          }

          // Show XP gain
          if (result.gamification.xpGained > 0) {
            messages.push({
              text: `⚡ +${result.gamification.xpGained} XP ganhos!`,
              side: 'bot',
              success: true,
            });
          }
        }

        onEntryLogged();
      } else {
        messages[statusIdx] = { text: '❌ Erro: ' + (result.error || 'Falha'), side: 'bot', error: true };
      }
    } catch (e) {
      const isNetworkError = !navigator.onLine || e.message?.includes('fetch') || e.message?.includes('network') || e.message?.includes('Failed') || e.message?.includes('timeout');
      if (isNetworkError) {
        await enqueueEntry(text, chatDate);
        messages[statusIdx] = { text: '📴 Sem conexão — registro salvo localmente. Será enviado quando voltar online.', side: 'bot', error: false };
      } else {
        messages[statusIdx] = { text: '❌ Erro de rede: ' + e.message, side: 'bot', error: true };
      }
    } finally {
      sending = false;
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  // Update chatDate when selectedDate changes
  $effect(() => {
    if (selectedDate) chatDate = selectedDate;
  });
</script>

<!-- FAB -->
<button
  onclick={toggle}
  class="fixed bottom-5 right-5 w-14 h-14 rounded-full bg-slate-900 dark:bg-slate-700 text-white flex items-center justify-center shadow-lg z-50 hover:bg-slate-800 dark:hover:bg-slate-600 active:scale-90 transition-all sm:bottom-8 sm:right-8"
>
  {#if offlineQueue.pendingCount > 0}
    <span class="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white dark:border-slate-800 animate-pulse">
      {offlineQueue.pendingCount}
    </span>
  {/if}
  {#if open}
    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  {:else}
    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  {/if}
</button>

<!-- Chat Modal -->
{#if open}
  <div class="fixed bottom-24 left-1/2 -translate-x-1/2 w-[85vw] max-w-[400px] max-h-[75dvh] bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-700 flex flex-col overflow-hidden z-50 sm:left-auto sm:right-8 sm:translate-x-0 sm:bottom-28 sm:w-[400px]"
    style="animation: slideUp 0.3s ease-out"
  >
    <!-- Header -->
    <div class="px-5 py-4 bg-slate-900 dark:bg-slate-900 text-white flex justify-between items-center">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span class="text-sm font-bold tracking-tight">Health Assistant</span>
      </div>
      <button onclick={toggle} class="p-1 hover:bg-slate-800 rounded-lg transition-colors" aria-label="Fechar chat">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Date selector -->
    <div class="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
      <label for="chat-date" class="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Data do Registro</label>
      <input id="chat-date" type="date" bind:value={chatDate}
        class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 w-full outline-none focus:ring-2 focus:ring-emerald-500" />
    </div>

    <!-- Offline pending banner -->
    {#if offlineQueue.pendingCount > 0}
      <div class="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2">
        <span class="text-[10px] font-bold text-amber-700 dark:text-amber-400">📴 {offlineQueue.pendingCount} registro(s) pendente(s)</span>
        <button
          onclick={async () => { const r = await flushQueue(); if (r.some(x => x.success)) onEntryLogged(); }}
          disabled={offlineQueue.flushing || !navigator.onLine}
          class="text-[10px] font-black text-amber-600 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 px-3 py-1 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800/40 disabled:opacity-50 transition-colors"
        >
          {offlineQueue.flushing ? 'Enviando...' : 'Enviar agora'}
        </button>
      </div>
    {/if}

    <!-- Messages -->
    <div class="flex-1 min-h-[200px] overflow-y-auto p-5 flex flex-col gap-3 bg-slate-50 dark:bg-slate-900/30">
      {#each messages as msg}
        <div class="px-4 py-3 rounded-2xl max-w-[85%] text-sm leading-relaxed shadow-sm
          {msg.side === 'user'
            ? 'self-end bg-emerald-500 text-white rounded-br-sm'
            : 'self-start bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-bl-sm'}
          {msg.success ? 'font-bold !text-emerald-600 dark:!text-emerald-400' : ''}
          {msg.error ? '!text-red-500 dark:!text-red-400' : ''}"
        >
          {msg.text}
        </div>
      {/each}
    </div>

    <!-- Input -->
    <div class="px-4 py-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 flex gap-2 items-center">
      <input
        type="text"
        bind:value={input}
        onkeydown={handleKeydown}
        placeholder="Descreva sua refeição..."
        disabled={sending}
        class="flex-1 h-12 px-4 bg-slate-50 dark:bg-slate-900 rounded-2xl text-sm border-none outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 dark:text-slate-300"
      />
      <button
        onclick={send}
        disabled={sending || !input.trim()}
        class="w-12 h-12 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-slate-600 disabled:opacity-50 transition-all"
        aria-label="Enviar mensagem"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 rotate-90" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
