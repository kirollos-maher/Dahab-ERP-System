/* ═══════════════════════════════════════════════════════════════════════
   GOLD MS ENTERPRISE — js/11-realtime.js
   محرك التحديثات المباشرة (Realtime Engine):
     - Supabase Realtime WebSocket subscriptions
     - Local event bus (emit / on)
     - Live Activity Feed (persisted in LocalStorage)
     - Auto-reconnect with exponential backoff
     - Demo simulator (وضع تجريبي عند غياب Supabase)
     - Badge management (queue + unread)
     - Online/offline handling
     - Integration with Sync engine
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const GMS = window.GMS = window.GMS || {};

  /* ═════════════════════════════════════════════════════════════════════
     §1 · REALTIME STATE
     ═════════════════════════════════════════════════════════════════════ */
  const RState = {
    /* حالة النظام */
    initialized: false,
    subscribed: false,

    /* حالة الاتصال */
    channelStatus: 'idle',       // 'idle' | 'connecting' | 'connected' | 'error'
    channel: null,
    channelName: null,
    reconnectAttempts: 0,
    reconnectTimer: null,

    /* إحصائيات */
    stats: {
      totalEvents: 0,
      lastRealtimeEvent: null,
      connectionStartAt: null,
      disconnections: 0,
      reconnections: 0,
      feedCount: 0,
    },

    /* Feed (سجل الأحداث) */
    feed: [],
    feedMaxItems: 100,
    feedUnreadCount: 0,

    /* المستمعون */
    listeners: {
      event: new Set(),           // أي حدث realtime
      feedUpdate: new Set(),      // إضافة/حذف في الـ feed
      connectionChange: new Set(),// تغيير حالة الاتصال
      onlineChange: new Set(),    // online/offline من المتصفح
    },

    /* الوضع التجريبي */
    demoMode: false,
    demoTimer: null,

    /* الإعدادات */
    config: {
      reconnectBaseMs: 1500,
      reconnectMaxMs: 30000,
      demoIntervalMs: 4500,
      feedPersistKey: 'gms.rt.feed',
      feedUnreadKey: 'gms.rt.unread',
      maxEventsPerSecond: 20,
    },

    /* مؤقتات */
    timers: {
      badge: null,
      persist: null,
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §2 · EVENT EMITTER (Local Event Bus)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * إطلاق حدث للمستمعين
   * @param {string} eventName
   * @param {*} data
   */
  function fire(eventName, data) {
    const set = RState.listeners[eventName];
    if (!set || set.size === 0) return;

    set.forEach(fn => {
      try {
        fn(data);
      } catch (e) {
        console.error(`[Realtime.fire:${eventName}]`, e);
      }
    });
  }

  /**
   * الاشتراك في حدث
   * @param {string} eventName
   * @param {Function} fn
   * @returns {Function} unsubscribe
   */
  function on(eventName, fn) {
    const set = RState.listeners[eventName];
    if (!set || typeof fn !== 'function') return () => {};

    set.add(fn);
    return () => set.delete(fn);
  }

  /**
   * إطلاق حدث محلي (يُستخدم من Views بعد INSERT/UPDATE)
   * @param {string} table
   * @param {string} action   — 'INSERT' | 'UPDATE' | 'DELETE'
   * @param {Object} row
   * @param {Object} [oldRow]
   */
  function emit(table, action, row, oldRow) {
    const payload = {
      table: table,
      action: action || 'INSERT',
      row: row || {},
      old: oldRow || null,
      timestamp: new Date().toISOString(),
      source: 'local',
    };

    handleRealtimeEvent(payload);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §3 · FEED ENGINE (Live Activity Feed)
     ═════════════════════════════════════════════════════════════════════ */

  const Feed = {

    /**
     * إضافة حدث للـ feed
     * @param {Object} event
     * @param {string} event.table
     * @param {string} event.action
     * @param {Object} event.row
     * @returns {Object} feed entry
     */
    add(event) {
      if (!event || !event.table) return null;

      const entry = this._buildEntry(event);
      if (!entry) return null;

      RState.feed.unshift(entry);
      RState.stats.feedCount = RState.feed.length;

      /* احتفظ بالحد الأقصى */
      if (RState.feed.length > RState.feedMaxItems) {
        RState.feed = RState.feed.slice(0, RState.feedMaxItems);
      }

      RState.feedUnreadCount++;

      /* احفظ */
      this._persist();

      /* أطلق حدث */
      fire('feedUpdate', entry);

      return entry;
    },

    /**
     * بناء عنصر feed من حدث
     * @private
     */
    _buildEntry(event) {
      const { table, action, row } = event;
      if (!row) return null;

      const timestamp = event.timestamp || new Date().toISOString();
      const base = {
        id: GMS.uid(),
        table,
        action,
        row,
        timestamp,
        unread: true,
        icon: 'activity',
        cls: 'update',
        title: '',
        description: '',
        amount: null,
        amountUnit: '',
        meta: {},
      };

      /* ─── sales ─── */
      if (table === 'sales') {
        base.icon = 'receipt';
        base.cls = 'sale';
        base.title = action === 'INSERT'
          ? 'فاتورة بيع جديدة'
          : action === 'UPDATE'
            ? 'تحديث فاتورة'
            : 'حذف فاتورة';
        base.description = row.sale_no || row.invoice_no || row.id || '—';
        base.amount = row.grand_total ? GMS.moneyFmt(row.grand_total) : null;
        base.amountUnit = ' ج.م';
        base.meta = {
          payment_method: row.payment_method,
          branch_id: row.branch_id,
        };
      }

      /* ─── inventory ─── */
      else if (table === 'inventory') {
        base.icon = 'gem';
        base.cls = 'stock';
        base.title = action === 'INSERT'
          ? 'صنف جديد في المخزون'
          : action === 'UPDATE'
            ? 'تحديث صنف'
            : 'حذف صنف';
        base.description = row.sku || '—';
        if (row.karat) {
          base.description += ` · ${row.karat}K`;
        }
        if (row.net_weight) {
          base.description += ` · ${GMS.gramFmt(row.net_weight)} جم`;
        }
        base.meta = {
          karat: row.karat,
          status: row.status,
          branch_id: row.branch_id,
        };
      }

      /* ─── entity_ledger ─── */
      else if (table === 'entity_ledger') {
        base.icon = 'book-open';
        base.cls = 'ledger';
        base.title = 'حركة في دفتر الموردين';
        const goldDelta = Number(row.gold_delta || 0);
        const cashDelta = Number(row.cash_delta || 0);

        const parts = [];
        if (goldDelta !== 0) {
          parts.push(`${goldDelta > 0 ? '+' : ''}${GMS.gramFmt(goldDelta)} جم`);
        }
        if (cashDelta !== 0) {
          parts.push(`${cashDelta > 0 ? '+' : ''}${GMS.moneyFmt(cashDelta)} ج.م`);
        }
        base.description = row.description || parts.join(' · ') || '—';
        base.meta = {
          entry_type: row.entry_type,
          supplier_id: row.entity_id,
        };
      }

      /* ─── shifts ─── */
      else if (table === 'shifts') {
        base.icon = 'lock';
        base.cls = 'alert';
        base.title = row.status === 'CLOSED'
          ? 'إغلاق وردية'
          : 'تحديث وردية';
        base.description = row.shift_no || row.id || '—';
        if (row.cash_variance !== undefined && row.cash_variance !== 0) {
          base.description += ` · فرق: ${GMS.moneyFmt(row.cash_variance)} ج.م`;
        }
        base.meta = {
          branch_id: row.branch_id,
          cashier: row.cashier_name,
        };
      }

      /* ─── price_board ─── */
      else if (table === 'price_board') {
        base.icon = 'trending-up';
        base.cls = 'alert';
        base.title = 'تحديث سعر الذهب';
        base.description = row.price_24
          ? `سعر 24K: ${GMS.moneyFmt(row.price_24)} ج.م`
          : '—';
        base.meta = {
          effective_date: row.effective_date,
        };
      }

      /* ─── returns ─── */
      else if (table === 'returns') {
        base.icon = 'rotate-ccw';
        base.cls = 'purchase';
        base.title = row.return_type === 'buyback'
          ? 'شراء كسر'
          : row.return_type === 'supplier_return'
            ? 'مرتجع مورد'
            : 'مرتجع عميل';
        base.description = row.return_no || row.sku || '—';
        const amount = Number(row.refund_amount || 0) + Number(row.credit_issued || 0);
        if (amount > 0) {
          base.amount = GMS.moneyFmt(amount);
          base.amountUnit = ' ج.م';
        }
        base.meta = {
          karat: row.karat,
          pure_weight: row.pure_weight,
        };
      }

      /* ─── repairs ─── */
      else if (table === 'repairs') {
        base.icon = 'wrench';
        base.cls = 'stock';
        base.title = action === 'INSERT'
          ? 'تكت صيانة جديد'
          : action === 'UPDATE'
            ? 'تحديث تكت صيانة'
            : 'حذف تكت صيانة';
        base.description = `${row.ticket_no || '—'} · ${row.customer_name || ''}`;
        if (row.grand_total) {
          base.amount = GMS.moneyFmt(row.grand_total);
          base.amountUnit = ' ج.م';
        }
        base.meta = {
          status: row.status,
          karat: row.karat_in,
        };
      }

      /* ─── scrap_vault ─── */
      else if (table === 'scrap_vault') {
        base.icon = 'vault';
        base.cls = 'stock';
        base.title = 'إضافة لكسر المحل';
        base.description = row.source_ticket || '—';
        if (row.pure_weight) {
          base.description += ` · ${GMS.gramFmt(row.pure_weight)} جم بندق`;
        }
        base.meta = {
          karat: row.karat,
          value_egp: row.value_egp,
        };
      }

      /* ─── audit_logs ─── */
      else if (table === 'audit_logs') {
        base.icon = 'scroll-text';
        base.cls = 'update';
        base.title = 'سجل حركة';
        base.description = row.description || row.action || '—';
        base.meta = {
          action: row.action,
          entity_type: row.entity_type,
          user_name: row.user_name,
        };
      }

      /* ─── fallback ─── */
      else {
        base.title = `${action} على ${table}`;
        base.description = row.id || '—';
      }

      return base;
    },

    /**
     * قراءة العناصر
     * @param {Object} [opts]
     * @param {number} [opts.limit=50]
     * @param {boolean} [opts.unreadOnly=false]
     * @param {string} [opts.table='']
     * @returns {Array}
     */
    getAll(opts = {}) {
      const { limit = 50, unreadOnly = false, table = '' } = opts;

      let rows = RState.feed.slice();

      if (unreadOnly) {
        rows = rows.filter(r => r.unread);
      }

      if (table) {
        rows = rows.filter(r => r.table === table);
      }

      return rows.slice(0, limit);
    },

    /**
     * عدد العناصر غير المقروءة
     * @returns {number}
     */
    unreadCount() {
      return RState.feedUnreadCount;
    },

    /**
     * عدد العناصر الكلي
     * @returns {number}
     */
    count() {
      return RState.feed.length;
    },

    /**
     * تعليم الكل كمقروء
     */
    markAllRead() {
      RState.feed.forEach(item => {
        item.unread = false;
      });
      RState.feedUnreadCount = 0;
      this._persist();
      updateBadge();
    },

    /**
     * حذف عنصر
     * @param {string} id
     */
    remove(id) {
      const idx = RState.feed.findIndex(f => f.id === id);
      if (idx < 0) return;

      const item = RState.feed[idx];
      if (item.unread) {
        RState.feedUnreadCount = Math.max(0, RState.feedUnreadCount - 1);
      }

      RState.feed.splice(idx, 1);
      this._persist();
      updateBadge();
    },

    /**
     * تفريغ كل السجل
     */
    clear() {
      RState.feed = [];
      RState.feedUnreadCount = 0;
      RState.stats.feedCount = 0;
      this._persist();
      updateBadge();

      fire('feedUpdate', null);
    },

    /**
     * حفظ في LocalStorage
     * @private
     */
    _persist() {
      try {
        localStorage.setItem(
          RState.config.feedPersistKey,
          JSON.stringify(RState.feed.slice(0, RState.feedMaxItems))
        );
        localStorage.setItem(
          RState.config.feedUnreadKey,
          String(RState.feedUnreadCount)
        );
      } catch (_) {}
    },

    /**
     * استرجاع من LocalStorage
     * @private
     */
    _restore() {
      try {
        const raw = localStorage.getItem(RState.config.feedPersistKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            RState.feed = parsed.slice(0, RState.feedMaxItems);
          }
        }

        const unread = localStorage.getItem(RState.config.feedUnreadKey);
        if (unread !== null) {
          RState.feedUnreadCount = Number(unread) || 0;
        }
      } catch (_) {}
    },
  };

  /* ═════════════════════════════════════════════════════════════════════
     §4 · EVENT HANDLER (Central Router)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * معالج الأحداث القادمة من Supabase أو من emit المحلي
   * @param {Object} payload
   */
  function handleRealtimeEvent(payload) {
    if (!payload || !payload.table) return;

    /* تحديث الإحصائيات */
    RState.stats.totalEvents++;
    RState.stats.lastRealtimeEvent = new Date().toISOString();

    /* أضف للـ feed (ماعدا أحداث audit_logs لمنع التضخم) */
    if (payload.table !== 'audit_logs' || payload.action !== 'UPDATE') {
      try {
        Feed.add(payload);
      } catch (e) {
        console.warn('[Realtime] Feed.add failed:', e);
      }
    }

    /* أطلق الحدث العام */
    fire('event', payload);

    /* حدّث Badge */
    scheduleBadgeUpdate();

    /* حفظ الـ feed */
    scheduleFeedPersist();
  }

  /* ═════════════════════════════════════════════════════════════════════
     §5 · SUPABASE REALTIME SUBSCRIPTION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * بدء الاشتراك في القنوات
   */
  function subscribe() {
    /* إذا سبق الاشتراك — ألغِ القديم */
    if (RState.subscribed) {
      unsubscribe();
    }

    /* ─── الوضع التجريبي (بدون Supabase) ─── */
    if (!GMS.Sync?.sb?.isReady?.()) {
      console.log('[Realtime] 🎮 Demo mode — محاكاة الأحداث');
      RState.demoMode = true;
      setChannelStatus('connected', 'وضع تجريبي');
      startDemoSimulator();
      RState.subscribed = true;
      return;
    }

    /* ─── الوضع الحقيقي (Supabase) ─── */
    try {
      setChannelStatus('connecting', 'جارٍ الاتصال…');

      const client = GMS.Sync.sb.get();
      if (!client) throw new Error('Supabase client not ready');

      const channelName = `gms-realtime-${Date.now()}-${RState.reconnectAttempts}`;
      RState.channelName = channelName;

      const channel = client
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: '' },
          },
        })

        /* ─── sales ─── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sales' },
          (payload) => {
            handleSupabaseChange('sales', payload);
          }
        )

        /* ─── inventory ─── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory' },
          (payload) => {
            handleSupabaseChange('inventory', payload);
          }
        )

        /* ─── entity_ledger ─── */
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'entity_ledger' },
          (payload) => {
            handleSupabaseChange('entity_ledger', payload);
          }
        )

        /* ─── shifts ─── */
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'shifts' },
          (payload) => {
            handleSupabaseChange('shifts', payload);
          }
        )

        /* ─── price_board ─── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'price_board' },
          (payload) => {
            handleSupabaseChange('price_board', payload);
          }
        )

        /* ─── returns ─── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'returns' },
          (payload) => {
            handleSupabaseChange('returns', payload);
          }
        )

        /* ─── repairs ─── */
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'repairs' },
          (payload) => {
            handleSupabaseChange('repairs', payload);
          }
        )

        /* ─── حالة الاشتراك ─── */
        .subscribe((status, err) => {
          switch (status) {
            case 'SUBSCRIBED':
              RState.reconnectAttempts = 0;
              RState.stats.connectionStartAt = new Date().toISOString();
              setChannelStatus('connected', 'مباشر · متصل');
              clearReconnectTimer();
              console.log('[Realtime] ✅ Subscribed:', channelName);
              break;

            case 'CHANNEL_ERROR':
              console.warn('[Realtime] ⚠️ Channel error:', err);
              setChannelStatus('error', 'خطأ في الاتصال');
              scheduleReconnect();
              break;

            case 'TIMED_OUT':
              console.warn('[Realtime] ⏱ Timeout');
              setChannelStatus('error', 'انتهت المهلة');
              scheduleReconnect();
              break;

            case 'CLOSED':
              console.log('[Realtime] Channel closed');
              if (RState.channelStatus !== 'error') {
                setChannelStatus('connecting', 'إعادة الاتصال…');
              }
              break;

            default:
              console.log('[Realtime] Status:', status);
              break;
          }
        });

      RState.channel = channel;
      RState.subscribed = true;
      RState.demoMode = false;

    } catch (e) {
      console.error('[Realtime] Subscribe failed:', e);
      setChannelStatus('error', e.message);
      scheduleReconnect();
    }
  }

  /**
   * معالجة تغيير قادم من Supabase
   * @param {string} table
   * @param {Object} payload
   */
  function handleSupabaseChange(table, payload) {
    const { eventType, new: newRow, old: oldRow } = payload;

    const row = eventType === 'DELETE' ? oldRow : newRow;
    if (!row) return;

    /* أضف flag source */
    const realtimePayload = {
      table,
      action: eventType,
      row,
      old: oldRow,
      timestamp: new Date().toISOString(),
      source: 'supabase',
    };

    /* إبطال الذاكرة المؤقتة */
    if (GMS.Cache?.handleRealtimeInvalidation) {
      try {
        GMS.Cache.handleRealtimeInvalidation({
          table,
          action: eventType,
          id: row.id,
          row,
        });
      } catch (_) {}
    }

    handleRealtimeEvent(realtimePayload);
  }

  /**
   * إلغاء الاشتراك
   */
  function unsubscribe() {
    /* إلغاء Supabase channel */
    if (RState.channel && GMS.Sync?.sb?.isReady?.()) {
      try {
        const client = GMS.Sync.sb.get();
        if (client) client.removeChannel(RState.channel);
      } catch (e) {
        console.warn('[Realtime] Remove channel failed:', e);
      }
    }

    RState.channel = null;
    RState.channelName = null;
    RState.subscribed = false;

    /* أوقف الوضع التجريبي */
    stopDemoSimulator();

    setChannelStatus('idle', 'غير متصل');
  }

  /**
   * تعيين حالة القناة
   * @param {'idle'|'connecting'|'connected'|'error'} status
   * @param {string} [text]
   */
  function setChannelStatus(status, text) {
    const prevStatus = RState.channelStatus;
    RState.channelStatus = status;

    /* أطلق حدث التغيير */
    if (prevStatus !== status) {
      fire('connectionChange', {
        status,
        text: text || '',
        previous: prevStatus,
      });
    }
  }

  /**
   * جدولة إعادة الاتصال (exponential backoff)
   */
  function scheduleReconnect() {
    if (RState.reconnectTimer) return;

    RState.reconnectAttempts++;
    RState.stats.disconnections++;

    const delay = Math.min(
      RState.config.reconnectMaxMs,
      RState.config.reconnectBaseMs *
        Math.pow(1.6, RState.reconnectAttempts - 1)
    );

    console.log(
      `[Realtime] 🔄 Reconnect in ${Math.round(delay / 1000)}s ` +
      `(attempt ${RState.reconnectAttempts})`
    );

    setChannelStatus('connecting',
      `إعادة المحاولة خلال ${Math.round(delay / 1000)}s`);

    RState.reconnectTimer = setTimeout(() => {
      RState.reconnectTimer = null;
      RState.stats.reconnections++;
      subscribe();
    }, delay);
  }

  /**
   * إلغاء مؤقت إعادة الاتصال
   */
  function clearReconnectTimer() {
    if (RState.reconnectTimer) {
      clearTimeout(RState.reconnectTimer);
      RState.reconnectTimer = null;
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §6 · DEMO SIMULATOR (وضع تجريبي بدون Supabase)
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * بدء المحاكاة
   */
  function startDemoSimulator() {
    stopDemoSimulator();

    const tick = () => {
      if (!RState.demoMode) return;

      const rnd = Math.random();

      try {
        if (rnd < 0.55) {
          simulateSale();
        } else if (rnd < 0.75) {
          simulateInventoryChange();
        } else if (rnd < 0.90) {
          simulateLedgerEntry();
        } else {
          simulateShiftClosure();
        }
      } catch (e) {
        console.warn('[Realtime:demo] Simulation failed:', e);
      }
    };

    RState.demoTimer = setInterval(
      tick,
      RState.config.demoIntervalMs + Math.random() * 3000
    );
  }

  /**
   * إيقاف المحاكاة
   */
  function stopDemoSimulator() {
    if (RState.demoTimer) {
      clearInterval(RState.demoTimer);
      RState.demoTimer = null;
    }
  }

  /**
   * محاكاة بيعة
   * @private
   */
  function simulateSale() {
    const price24 = GMS.Cache?.getPrice()?.price_24 || 4500;
    const pure = GMS.round(1 + Math.random() * 15, 4);
    const value = GMS.round(pure * price24 * (1.05 + Math.random() * 0.2), 2);

    handleRealtimeEvent({
      table: 'sales',
      action: 'INSERT',
      row: {
        id: GMS.uid(),
        sale_no: GMS.invoiceNo('INV'),
        grand_total: value,
        total_pure_weight: pure,
        payment_method: ['cash', 'card', 'instapay'][Math.floor(Math.random() * 3)],
        branch_id: GMS.Auth?.profile?.branch_id || GMS.APP_CONFIG.DEFAULT_BRANCH_ID,
        created_at: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      source: 'demo',
    });
  }

  /**
   * محاكاة تغيير مخزون
   * @private
   */
  function simulateInventoryChange() {
    handleRealtimeEvent({
      table: 'inventory',
      action: 'INSERT',
      row: {
        id: 'inv-' + GMS.uid(),
        sku: GMS.generateSKU({
          manufacturerCode: 'A',
          karat: 21,
          seq: Math.floor(Math.random() * 9999),
        }),
        karat: 21,
        status: 'IN_STOCK',
        pure_weight: GMS.round(Math.random() * 5, 4),
        net_weight: GMS.round(2 + Math.random() * 8, 3),
        created_at: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      source: 'demo',
    });
  }

  /**
   * محاكاة حركة دفتر موردين
   * @private
   */
  function simulateLedgerEntry() {
    const types = ['gold_received', 'cash_payment', 'scrap_settlement'];
    const entryType = types[Math.floor(Math.random() * types.length)];

    handleRealtimeEvent({
      table: 'entity_ledger',
      action: 'INSERT',
      row: {
        id: GMS.uid(),
        entry_type: entryType,
        gold_delta: entryType === 'gold_received'
          ? GMS.round(Math.random() * 30, 4)
          : 0,
        cash_delta: entryType === 'cash_payment'
          ? GMS.round(Math.random() * 80000, 2)
          : 0,
        description: entryType === 'gold_received'
          ? 'شحنة ذهب جديدة'
          : entryType === 'cash_payment'
            ? 'سداد نقدي'
            : 'تسوية كسر',
        created_at: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      source: 'demo',
    });
  }

  /**
   * محاكاة إغلاق وردية
   * @private
   */
  function simulateShiftClosure() {
    handleRealtimeEvent({
      table: 'shifts',
      action: 'UPDATE',
      row: {
        id: GMS.uid(),
        shift_no: 'SH-' + GMS.uid().toUpperCase().slice(0, 8),
        status: 'CLOSED',
        cash_variance: GMS.round((Math.random() - 0.5) * 200, 2),
        closed_at: new Date().toISOString(),
      },
      old: { status: 'OPEN' },
      timestamp: new Date().toISOString(),
      source: 'demo',
    });
  }

  /* ═════════════════════════════════════════════════════════════════════
     §7 · BADGE MANAGEMENT
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * جدولة تحديث الـ Badge (debounced)
   */
  function scheduleBadgeUpdate() {
    if (RState.timers.badge) return;

    RState.timers.badge = setTimeout(() => {
      RState.timers.badge = null;
      updateBadge();
    }, 500);
  }

  /**
   * تحديث الـ Badge
   */
  async function updateBadge() {
    try {
      /* Queue count */
      let queueCount = 0;
      if (GMS.IDB?.queueCount) {
        try {
          queueCount = await GMS.IDB.queueCount();
        } catch (_) {}
      }

      /* Unread feed count */
      const unreadFeed = RState.feedUnreadCount;

      /* Total badge */
      const total = queueCount + unreadFeed;

      /* حدّث UI */
      updateBadgeUI('queue-badge', queueCount);
      updateBadgeUI('tab-queue-badge', queueCount);

      /* App Badge API */
      if (GMS.PWA?.setBadge) {
        try {
          await GMS.PWA.setBadge(total);
        } catch (_) {}
      }

    } catch (e) {
      console.warn('[Realtime] updateBadge failed:', e);
    }
  }

  /**
   * تحديث عنصر Badge واحد
   * @private
   */
  function updateBadgeUI(elementId, count) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (count > 0) {
      el.style.display = '';
      el.textContent = count > 99 ? '99+' : String(count);
    } else {
      el.style.display = 'none';
    }
  }

  /* ═════════════════════════════════════════════════════════════════════
     §8 · PERSISTENCE (Debounced)
     ═════════════════════════════════════════════════════════════════════ */

  function scheduleFeedPersist() {
    if (RState.timers.persist) return;

    RState.timers.persist = setTimeout(() => {
      RState.timers.persist = null;
      Feed._persist();
    }, 1000);
  }

  /* ═════════════════════════════════════════════════════════════════════
     §9 · ONLINE/OFFLINE HANDLING
     ═════════════════════════════════════════════════════════════════════ */

  function bindNetworkListeners() {
    const handleOnline = () => {
      console.log('[Realtime] 🌐 Network online');
      fire('onlineChange', { online: true });

      /* أعد الاشتراك إذا كنا معطلين */
      if (!RState.subscribed || RState.channelStatus === 'error') {
        setTimeout(() => subscribe(), 1500);
      }
    };

    const handleOffline = () => {
      console.log('[Realtime] 📴 Network offline');
      fire('onlineChange', { online: false });
      setChannelStatus('idle', 'غير متصل — لا توجد شبكة');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    /* احفظ مرجع للتنظيف */
    RState._networkHandlers = { handleOnline, handleOffline };
  }

  function unbindNetworkListeners() {
    const h = RState._networkHandlers;
    if (!h) return;

    window.removeEventListener('online', h.handleOnline);
    window.removeEventListener('offline', h.handleOffline);
    RState._networkHandlers = null;
  }

  /* ═════════════════════════════════════════════════════════════════════
     §10 · INITIALIZATION
     ═════════════════════════════════════════════════════════════════════ */

  /**
   * تهيئة محرك التحديثات
   * @param {Object} [opts]
   * @param {boolean} [opts.autoSubscribe=true]
   * @param {boolean} [opts.loadFeed=true]
   * @returns {Promise<Object>}
   */
  async function init(opts = {}) {
    const {
      autoSubscribe = true,
      loadFeed = true,
    } = opts;

    if (RState.initialized) {
      console.log('[Realtime] Already initialized');
      return getState();
    }

    /* 1 · استرجاع الـ feed من LocalStorage */
    if (loadFeed) {
      Feed._restore();
    }

    /* 2 · ربط مستمعي الشبكة */
    bindNetworkListeners();

    /* 3 · بدء الاشتراك */
    if (autoSubscribe) {
      subscribe();
    }

    /* 4 · Badge أولي */
    setTimeout(() => updateBadge(), 1000);

    /* 5 · تحديث دوري للـ badge */
    RState.timers._badgeInterval = setInterval(() => {
      if (!document.hidden) updateBadge();
    }, 60000);

    RState.initialized = true;

    console.log('[Realtime] ✅ Initialized', {
      demoMode: RState.demoMode,
      feedCount: RState.feed.length,
      unreadCount: RState.feedUnreadCount,
    });

    return getState();
  }

  /**
   * إيقاف كل شيء
   */
  function shutdown() {
    unsubscribe();
    clearReconnectTimer();
    stopDemoSimulator();
    unbindNetworkListeners();

    if (RState.timers._badgeInterval) {
      clearInterval(RState.timers._badgeInterval);
      RState.timers._badgeInterval = null;
    }

    if (RState.timers.badge) {
      clearTimeout(RState.timers.badge);
      RState.timers.badge = null;
    }

    if (RState.timers.persist) {
      clearTimeout(RState.timers.persist);
      RState.timers.persist = null;
    }

    RState.initialized = false;
    console.log('[Realtime] 🛑 Shutdown');
  }

  /* ═════════════════════════════════════════════════════════════════════
     §11 · PUBLIC API — STATE GETTERS
     ═════════════════════════════════════════════════════════════════════ */

  function getState() {
    return {
      initialized: RState.initialized,
      subscribed: RState.subscribed,
      channelStatus: RState.channelStatus,
      channelName: RState.channelName,
      demoMode: RState.demoMode,
      reconnectAttempts: RState.reconnectAttempts,
      stats: { ...RState.stats },
      feedCount: RState.feed.length,
      feedUnread: RState.feedUnreadCount,
    };
  }

  /* ═════════════════════════════════════════════════════════════════════
     §12 · EXPORT
     ═════════════════════════════════════════════════════════════════════ */
  GMS.Realtime = {
    /* State */
    get state() { return RState; },

    /* Core */
    init,
    shutdown,

    /* Subscription */
    subscribe,
    unsubscribe,

    /* Events */
    on,
    emit,

    /* Feed */
    Feed,

    /* Badge */
    updateBadge,

    /* Status */
    setChannelStatus,
    getState,

    /* Reconnect */
    scheduleReconnect,
    clearReconnectTimer,

    /* Demo */
    startDemoSimulator,
    stopDemoSimulator,
  };

  /* ─── Convenience aliases ──────────────────────────────────────── */
  GMS.RealtimeFeed = Feed;
  GMS.RealtimeState = RState;

  /* ─── Backward-compat: بعض الملفات تستخدم GMS.Realtime.emit ─── */
  GMS.rt = GMS.Realtime;

  /* ═════════════════════════════════════════════════════════════════════
     §13 · LOADED CONFIRMATION
     ═════════════════════════════════════════════════════════════════════ */
  console.log(
    '%c📡 Realtime Engine loaded · Supabase WS + Local Bus + Feed',
    'color:#6b3fa0;font-weight:800;font-size:12px;padding:1px 5px;' +
    'background:#f0e9fa;border-radius:4px;'
  );

  console.log(
    `%c🔌 8 tables subscribed · Auto-reconnect · Demo mode · Activity Feed`,
    'color:#6b7a95;font-weight:700;font-size:11px;'
  );

  /* ═════════════════════════════════════════════════════════════════════
     ✅ js/11-realtime.js — نهاية الملف
     ═════════════════════════════════════════════════════════════════════ */

})();
