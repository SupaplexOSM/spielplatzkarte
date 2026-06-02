<script>
  import { fetchReviews, submitReview, starsHtml, relativeDate } from '../lib/reviews.js';
  import { _ } from 'svelte-i18n';

  /** @type {number} Playground centre latitude (WGS84) */
  export let lat = 0;
  /** @type {number} Playground centre longitude (WGS84) */
  export let lon = 0;
  /** @type {string|number|null} OSM ID of the playground — scopes reviews to this specific location. */
  export let osmId = null;

  let reviews = [];
  let loading = true;
  let error = false;

  // ── Star rating state ───────────────────────────────────────────────────
  let selectedRating = null;   // 20/40/60/80/100
  let hoverRating = null;
  let opinion = '';
  let submitting = false;
  let submitStatus = '';       // success/error message

  let abortCtrl = null;

  $: if (osmId) loadReviews();

  async function loadReviews() {
    abortCtrl?.abort();
    abortCtrl = new AbortController();
    loading = true;
    error = false;
    try {
      reviews = await fetchReviews(lat, lon, osmId, abortCtrl.signal);
    } catch (e) {
      if (e?.name !== 'AbortError') error = true;
    } finally {
      loading = false;
    }
  }

  async function submit() {
    if (!selectedRating) return;
    submitting = true;
    submitStatus = '';
    try {
      const ok = await submitReview(lat, lon, osmId, selectedRating, opinion.trim() || null);
      if (ok) {
        submitStatus = 'success';
        selectedRating = null;
        opinion = '';
        setTimeout(() => loadReviews(), 1500);
      } else {
        submitStatus = 'error';
      }
    } catch {
      submitStatus = 'error';
    } finally {
      submitting = false;
    }
  }

  $: displayRating = hoverRating ?? selectedRating;
  $: ratedReviews = reviews.filter(r => typeof r.payload?.rating === 'number');
  $: avgRating = ratedReviews.length
    ? ratedReviews.reduce((s, r) => s + r.payload.rating, 0) / ratedReviews.length
    : null;
</script>

{#if loading}
  <small class="text-muted"><i>{$_('reviews.loading')}</i></small>

{:else if error}
  <small class="text-muted">{$_('reviews.loadError')}</small>

{:else}
  <!-- Aggregate score card -->
  {#if ratedReviews.length > 0}
    <div class="review-aggregate">
      <span class="review-score">{(avgRating / 20).toFixed(1)}</span>
      <div>
        {@html starsHtml(avgRating)}
        <span class="text-muted" style="font-size:11px">
          ({$_('reviews.count', { values: { count: ratedReviews.length } })})
        </span>
      </div>
    </div>
  {/if}

  {#if reviews.length > 0}
    {#each reviews as r}
      {@const p = r.payload}
      <div class="review-card">
        <div class="review-card__header">
          {#if typeof p.rating === 'number'}
            {@html starsHtml(p.rating, '#f59e0b')}
          {/if}
          <span class="review-date">{relativeDate(p.iat, $_)}</span>
        </div>
        {#if p.opinion}
          <p class="review-card__body">"{p.opinion}"</p>
        {/if}
      </div>
    {/each}
  {:else}
    <p class="text-muted mb-2" style="font-size:12px">{$_('reviews.empty')}</p>
  {/if}

  <!-- Submission form -->
  <div class="review-form">
    <p class="review-form__label">{$_('reviews.yourOpinion') ?? 'Your opinion'}</p>
    <div class="d-flex gap-1 mb-2" role="group" aria-label={$_('reviews.selectRating')}>
      {#each [20, 40, 60, 80, 100] as v, i}
        <button
          type="button"
          class="star-btn"
          style="color: {displayRating && v <= displayRating ? '#f59e0b' : '#d1d5db'}"
          onclick={() => selectedRating = v}
          onmouseenter={() => hoverRating = v}
          onmouseleave={() => hoverRating = null}
          aria-label={$_('reviews.starLabel', { values: { n: i + 1 } })}
        >★</button>
      {/each}
    </div>

    <textarea
      class="form-control form-control-sm mb-2"
      rows="2"
      placeholder={$_('reviews.opinionPlaceholder')}
      style="font-size:13px; resize:none;"
      bind:value={opinion}
      disabled={submitting}
    ></textarea>

    <button
      class="btn btn-sm btn-primary w-100"
      onclick={submit}
      disabled={!selectedRating || submitting}
      style="font-size:12px; background:#10b981; border-color:#10b981;"
    >
      {#if submitting}
        <span class="spinner-border spinner-border-sm me-1" role="status"></span>
      {/if}
      {$_('reviews.submit')}
    </button>

    {#if submitStatus === 'success'}
      <p class="text-success mt-1 mb-0" style="font-size:11px">{$_('reviews.submitted')}</p>
    {:else if submitStatus === 'error'}
      <p class="text-danger mt-1 mb-0" style="font-size:11px">{$_('reviews.errorRetry')}</p>
    {/if}

    <p class="text-muted mt-1 mb-0" style="font-size:10px">
      {@html $_('reviews.privacyNote', { values: { mangroveLink: '<a href="https://mangrove.reviews" target="_blank" rel="noopener" class="link-secondary">Mangrove.reviews</a>' } })}
    </p>
  </div>
{/if}

<style>
  .review-aggregate {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  .review-score {
    font-size: 30px;
    font-weight: 700;
    color: #1f2937;
    line-height: 1;
  }
  .review-card {
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .review-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 5px;
  }
  .review-date { font-size: 11px; color: #9ca3af; }
  .review-card__body { font-size: 13px; color: #1f2937; line-height: 1.55; margin: 0; }

  .review-form {
    border: 1px dashed #e5e7eb;
    border-radius: 10px;
    padding: 12px 14px;
    background: #f9fafb;
    margin-top: 4px;
  }
  .review-form__label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 8px;
  }
  .star-btn {
    background: none; border: none; padding: 0;
    font-size: 22px; line-height: 1; cursor: pointer;
    transition: color 0.1s;
  }
  .star-btn:hover { transform: scale(1.15); }
</style>
