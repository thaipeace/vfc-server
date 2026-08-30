import { Test, TestingModule } from '@nestjs/testing';
import { SseConnectionService } from './sse-connection.service';

describe('SseConnectionService', () => {
  let service: SseConnectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SseConnectionService],
    }).compile();

    service = module.get<SseConnectionService>(SseConnectionService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addConnection & sendEvent', () => {
    it('should configure SSE headers and send initial connected event', () => {
      const mockRes: any = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        writableEnded: false,
        destroyed: false,
      };

      service.addConnection('conn_123', mockRes, '0988366412');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.write).toHaveBeenCalledWith(
        expect.stringContaining('event: connected\ndata:'),
      );
      expect(service.isConnectionActive('conn_123')).toBe(true);
    });

    it('should send custom event correctly to active client', () => {
      const mockRes: any = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        writableEnded: false,
        destroyed: false,
      };

      service.addConnection('conn_123', mockRes);
      const sent = service.sendEvent('conn_123', 'otp', { otp: '1234' });
      expect(sent).toBe(true);
      expect(mockRes.write).toHaveBeenCalledWith('event: otp\ndata: {"otp":"1234"}\n\n');
    });

    it('should return false if connection is not active or not found', () => {
      const sent = service.sendEvent('non_existent', 'otp', { otp: '1234' });
      expect(sent).toBe(false);
    });
  });

  describe('removeConnection', () => {
    it('should remove connection and close response stream', () => {
      const mockRes: any = {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        writableEnded: false,
        destroyed: false,
      };

      service.addConnection('conn_123', mockRes);
      expect(service.isConnectionActive('conn_123')).toBe(true);

      service.removeConnection('conn_123');
      expect(service.isConnectionActive('conn_123')).toBe(false);
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
