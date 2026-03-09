import { useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

export interface Notification {
  id: string;
  message: string;
  requestId?: number;
  createdAt: Date;
}

interface UseRealtimeNotificationsOptions {
  currentUser: User | null;
  /** Gọi khi có bước mới được assign cho user */
  onNewStep?: (notification: Notification) => void;
  /** Gọi khi request của user thay đổi trạng thái (approved/rejected) */
  onStatusChange?: (notification: Notification) => void;
  /** Khi muốn refresh danh sách request */
  onRefresh?: () => void;
}

/**
 * Hook subscribe Supabase Realtime cho:
 * 1. step_instances gán cho user hiện tại (IN_PROGRESS) → thông báo cần phê duyệt
 * 2. requests của user thay đổi status → thông báo kết quả
 */
export function useRealtimeNotifications({
  currentUser,
  onNewStep,
  onStatusChange,
  onRefresh,
}: UseRealtimeNotificationsOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  const handleStepChange = useCallback(
    (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const newRow = payload.new;
      const oldRow = payload.old;

      // Chỉ xử lý khi status chuyển sang IN_PROGRESS (bước mới assign cho tôi)
      if (newRow.status === 'IN_PROGRESS' && oldRow.status !== 'IN_PROGRESS') {
        const notification: Notification = {
          id:        String(newRow.id),
          message:   `Bạn cần phê duyệt: "${newRow.step_name}"`,
          requestId: newRow.request_id as number | undefined,
          createdAt: new Date(),
        };
        onNewStep?.(notification);
        onRefresh?.();
      }
    },
    [onNewStep, onRefresh]
  );

  const handleRequestChange = useCallback(
    (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const newRow = payload.new;
      const oldRow = payload.old;

      if (newRow.status === oldRow.status) return;

      let message: string | null = null;
      if (newRow.status === 'APPROVED') {
        message = `Yêu cầu "${newRow.title}" đã được phê duyệt`;
      } else if (newRow.status === 'REJECTED') {
        message = `Yêu cầu "${newRow.title}" đã bị từ chối`;
      } else if (newRow.status === 'CANCELLED') {
        message = `Yêu cầu "${newRow.title}" đã bị hủy`;
      }

      if (message) {
        const notification: Notification = {
          id:        `req-${newRow.id}-${newRow.status}`,
          message,
          requestId: newRow.id as number | undefined,
          createdAt: new Date(),
        };
        onStatusChange?.(notification);
        onRefresh?.();
      }
    },
    [onStatusChange, onRefresh]
  );

  useEffect(() => {
    if (!currentUser) return;

    // Hủy channel cũ nếu có
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`notifications-user-${currentUser.id}`)
      // 1. Lắng nghe step_instances được assign cho user
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'request_step_instances',
          filter: `assigned_to_id=eq.${currentUser.id}`,
        },
        handleStepChange
      )
      // 2. Lắng nghe requests do user tạo thay đổi trạng thái
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'requests',
          filter: `requester_id=eq.${currentUser.id}`,
        },
        handleRequestChange
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUser?.id]);

  return null;
}

/**
 * Lấy số bước đang chờ phê duyệt bởi user hiện tại
 * (dùng để hiển thị badge đếm)
 */
export async function getPendingApprovalCount(user: User): Promise<number> {
  const { count, error } = await supabase
    .from('request_step_instances')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'IN_PROGRESS')
    .or(`assigned_to_id.eq.${user.id},assigned_role.eq.${user.role}`);

  if (error) return 0;
  return count ?? 0;
}
