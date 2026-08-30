import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Response } from 'express';

export interface SseClient {
  res: Response;
  phone?: string;
  createdAt: Date;
  lastPingAt: Date;
}

@Injectable()
export class SseConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SseConnectionService.name);

  /**
   * [UAT-ACCEPTED-GAP]
   * Lưu trữ SSE connections trong in-memory Map (chạy đơn instance trên Render).
   * Phase 2 sẽ nâng cấp lên Redis Pub/Sub nếu scale nhiều instances.
   */
  private readonly connections = new Map<string, SseClient>();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  onModuleInit() {
    // 1. Heartbeat ping mỗi 30 giây để duy trì kết nối qua Cloudflare / Render proxy
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);

    // 2. Dọn dẹp các kết nối stale (> 10 phút hoặc đã đóng socket) mỗi 60 giây
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 60000);
  }

  onModuleDestroy() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.connections.clear();
  }

  /**
   * Đăng ký một kết nối SSE mới từ client
   */
  addConnection(connectionId: string, res: Response, phone?: string): void {
    // Cấu hình SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Chống proxy buffer trên Render/Nginx
    res.flushHeaders?.();

    const client: SseClient = {
      res,
      phone,
      createdAt: new Date(),
      lastPingAt: new Date(),
    };

    this.connections.set(connectionId, client);
    this.logger.log(
      `SSE Client connected: ${connectionId} (Total active: ${this.connections.size})`,
    );

    // Gửi sự kiện chào mừng "connected" kèm connectionId
    this.sendRawEvent(res, 'connected', { connectionId, timestamp: Date.now() });
  }

  /**
   * Gắn SĐT với connectionId khi user nhập số trên form
   */
  bindPhone(connectionId: string, phone: string): void {
    const client = this.connections.get(connectionId);
    if (client) {
      client.phone = phone;
      this.logger.log(`Bound phone ${phone} to SSE connection ${connectionId}`);
    }
  }

  /**
   * Kiểm tra connectionId có đang mở và hoạt động hay không
   */
  isConnectionActive(connectionId?: string): boolean {
    if (!connectionId) return false;
    const client = this.connections.get(connectionId);
    if (!client) return false;
    return !client.res.writableEnded && !client.res.destroyed;
  }

  /**
   * Gửi một event SSE đến client theo connectionId
   */
  sendEvent(connectionId: string, eventName: string, data: any): boolean {
    const client = this.connections.get(connectionId);
    if (!client || client.res.writableEnded || client.res.destroyed) {
      this.removeConnection(connectionId);
      return false;
    }

    try {
      this.sendRawEvent(client.res, eventName, data);
      this.logger.log(
        `Sent SSE event [${eventName}] to ${connectionId}: ${JSON.stringify(
          data,
        )}`,
      );
      return true;
    } catch (err: any) {
      this.logger.error(
        `Failed to send SSE event to ${connectionId}: ${err?.message}`,
      );
      this.removeConnection(connectionId);
      return false;
    }
  }

  /**
   * Hủy và dọn dẹp connection khi client ngắt kết nối
   */
  removeConnection(connectionId: string): void {
    const client = this.connections.get(connectionId);
    if (client) {
      try {
        if (!client.res.writableEnded) {
          client.res.end();
        }
      } catch {}
      this.connections.delete(connectionId);
      this.logger.log(
        `SSE Client disconnected: ${connectionId} (Total active: ${this.connections.size})`,
      );
    }
  }

  /**
   * Định dạng chuẩn Server-Sent Event:
   * event: <eventName>
   * data: <jsonString>
   * \n\n
   */
  private sendRawEvent(res: Response, eventName: string, data: any): void {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
    (res as any).flush?.();
  }

  /**
   * Gửi comment ping để giữ kết nối không bị timeout
   */
  private sendHeartbeat(): void {
    for (const [connectionId, client] of this.connections.entries()) {
      if (client.res.writableEnded || client.res.destroyed) {
        this.connections.delete(connectionId);
        continue;
      }
      try {
        client.res.write(`:ping\n\n`);
        (client.res as any).flush?.();
        client.lastPingAt = new Date();
      } catch {
        this.connections.delete(connectionId);
      }
    }
  }

  /**
   * Dọn dẹp các kết nối cũ hoặc đã hỏng
   */
  private cleanupStaleConnections(): void {
    const maxAgeMs = 10 * 60 * 1000; // 10 phút
    const now = Date.now();

    for (const [connectionId, client] of this.connections.entries()) {
      const isStale = now - client.createdAt.getTime() > maxAgeMs;
      if (client.res.writableEnded || client.res.destroyed || isStale) {
        this.removeConnection(connectionId);
      }
    }
  }
}
