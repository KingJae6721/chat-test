import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const BASE_URL = 'http://localhost:3000';

function App() {
  const [token, setToken] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<any[]>([]); // 내 채팅방 목록
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [content, setContent] = useState('');

  // 1. 소켓 연결 관리
  useEffect(() => {
    if (!token) return;

    // 네임스페이스 /chat (백엔드 설정과 동일)
    const newSocket = io(`${BASE_URL}/chat`, {
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('✅ 소켓 연결 성공:', newSocket.id);
    });

    // 실시간 메시지 수신
    newSocket.on('newMessage', (msg) => {
      console.log('💬 새 메시지 수신:', msg);
      setMessages((prev) => [...prev, msg]);
    });

    // 실시간 알림 수신 (개인 룸 user_{userId} 기반)
    newSocket.on('notification', (notif) => {
      console.log('🔔 새 알림 수신:', notif);
      setNotifications((prev) => [notif, ...prev]);
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ 연결 에러:', err.message);
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, [token]);

  // 2. 내 채팅방 목록 불러오기 (REST API)
  const loadMyRooms = async () => {
    try {
      const res = await fetch(`${BASE_URL}/chats/rooms/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRooms(data);
      console.log('📚 참여 중인 방 목록:', data);
    } catch (err) { console.error('방 목록 로드 실패', err); }
  };

  // 3. 채팅방 입장 (소켓 joinRoom + 이전 메시지 로드)
  const enterRoom = async (roomId: number) => {
    if (!socket) return;

    // 소켓 서버의 룸 입장 (roomId는 숫자 그대로 전달)
    socket.emit('joinRoom', roomId, (res: any) => {
      if (res.status === 'success') {
        setCurrentRoomId(roomId);
        console.log(`🏃 ${roomId}번 방 입장 완료`);
        fetchMessages(roomId); // 이전 메시지 가져오기
      } else {
        alert('입장 권한이 없습니다: ' + res.message);
      }
    });
  };

  // 4. 이전 메시지 내역 조회 (REST API)
  const fetchMessages = async (roomId: number) => {
    const res = await fetch(`${BASE_URL}/chats/rooms/${roomId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setMessages(data);
  };

  // 5. 메시지 전송
  const sendMessage = () => {
    if (!socket || !currentRoomId || !content.trim()) return;

    // 백엔드 sendMessage 형식: { roomId, content }
    socket.emit('sendMessage', { roomId: currentRoomId, content }, (res: any) => {
      console.log('📤 전송 응답:', res);
      // newMessage 이벤트로 나에게도 오므로 여기서 setMessages를 또 할 필요는 없지만, 
      // 백엔드에서 전송자 포함 여부에 따라 달라질 수 있음 (현재 코드는 전체 브로드캐스트)
    });
    setContent('');
  };

  return (
    <div style={{ padding: '20px', display: 'flex', gap: '20px', fontFamily: 'sans-serif' }}>
      {/* 왼쪽: 설정 및 방 목록 */}
      <div style={{ width: '300px' }}>
        <h3>1. 설정</h3>
        <input
          type="text" placeholder="JWT Token 입력" value={token}
          onChange={(e) => setToken(e.target.value)}
          style={{ width: '100%', marginBottom: '10px' }}
        />
        <button onClick={loadMyRooms}>내 채팅방 새로고침</button>

        <h3>2. 내 채팅방</h3>
        <div style={{ border: '1px solid #ddd', minHeight: '100px', padding: '10px' }}>
          {rooms.map(room => (
            <div
              key={room.roomId}
              onClick={() => enterRoom(room.roomId)}
              style={{
                cursor: 'pointer', padding: '5px', borderBottom: '1px solid #eee',
                backgroundColor: currentRoomId === room.roomId ? '#e3f2fd' : 'transparent'
              }}
            >
              #{room.roomId} {room.title} <br />
              <small style={{ color: '#888' }}>{room.lastMessage}</small>
            </div>
          ))}
        </div>

        <h3>3. 실시간 알림</h3>
        <div style={{ maxHeight: '200px', overflowY: 'auto', background: '#fff9c4', padding: '10px' }}>
          {notifications.map((n, i) => (
            <div key={i} style={{ fontSize: '0.85em', marginBottom: '5px', borderBottom: '1px dotted #ccc' }}>
              <strong>[{n.type}]</strong> {n.message}
            </div>
          ))}
        </div>
      </div>

      {/* 오른쪽: 채팅창 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #ccc', height: '600px' }}>
        <div style={{ padding: '10px', background: '#000000ff' }}>
          {currentRoomId ? `${currentRoomId}번 채팅방` : '방을 선택해 주세요'}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: '10px', textAlign: m.senderId === 1 ? 'right' : 'left' }}>
              <small style={{ color: '#888' }}>{m.sender?.nickname || m.senderNickname}</small>
              <div style={{
                display: 'inline-block', padding: '8px', borderRadius: '10px',
                backgroundColor: '#000000ff', margin: '0 5px'
              }}>
                {m.content}
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px', display: 'flex' }}>
          <input
            type="text" style={{ flex: 1 }} value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage}>전송</button>
        </div>
      </div>
    </div>
  );
}

export default App;