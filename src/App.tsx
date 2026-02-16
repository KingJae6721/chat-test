import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

const BASE_URL = 'http://localhost:3000';

function App() {
  const [token, setToken] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [content, setContent] = useState('');

  // --- 입력 필드 상태 ---
  const [joinParams, setJoinParams] = useState({ meetingId: '', lessonId: '', studentId: '' });
  const [notifParams, setNotifParams] = useState({ type: 'PARTICIPATION_REQUEST', receiverId: '' });

  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. 소켓 연결 및 실시간 이벤트 리스너
  useEffect(() => {
    if (!token) return;
    const newSocket = io(`${BASE_URL}/chat`, { auth: { token } });

    newSocket.on('connect', () => console.log('✅ 소켓 연결 성공:', newSocket.id));

    // 새 메시지 수신 (현재 보고 있는 방이면 목록에 추가)
    newSocket.on('newMessage', (msg) => {
      if (msg.roomId === currentRoomId) {
        setMessages(prev => [...prev, msg]);
      }
    });

    // 실시간 알림 수신 (목록 맨 위에 추가)
    newSocket.on('notification', (notif) => {
      setNotifications(prev => [{ ...notif, isRead: false, createdAt: new Date().toISOString() }, ...prev]);
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, [token, currentRoomId]);

  // 자동 스크롤
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // 2. [알림] 과거 기록 불러오기 (GET /notifications)
  const fetchNotifHistory = async () => {
    try {
      const res = await fetch(`${BASE_URL}/notifications?page=1&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      setNotifications(result.data || []);
      console.log('📜 알림 기록 로드 완료');
    } catch (err) { console.error('알림 로드 실패'); }
  };

  // 3. [알림] 읽음 처리 (PATCH /notifications/:id/read)
  const markAsRead = async (notificationId: number) => {
    try {
      await fetch(`${BASE_URL}/notifications/${notificationId}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      // 로컬 화면 상태 업데이트
      setNotifications(prev => prev.map(n => n.notificationId === notificationId ? { ...n, isRead: true } : n));
    } catch (err) { console.error('읽음 처리 실패'); }
  };

  // 4. [채팅방] 목록 동기화
  const loadMyRooms = async () => {
    const res = await fetch(`${BASE_URL}/chats/rooms/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    setRooms(await res.json());
  };

  // 5. [채팅방] 참여/생성
  const joinOrCreateRoom = async () => {
    const body: any = {
      meetingId: joinParams.meetingId ? Number(joinParams.meetingId) : undefined,
      lessonId: joinParams.lessonId ? Number(joinParams.lessonId) : undefined,
      studentId: joinParams.studentId ? Number(joinParams.studentId) : undefined,
    };
    const res = await fetch(`${BASE_URL}/chats/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.id) { alert('방 참여 성공'); loadMyRooms(); }
  };

  // 6. [채팅방] 입장 및 이전 대화 로드
  const enterRoom = (roomId: number) => {
    socket?.emit('joinRoom', roomId, async (res: any) => {
      if (res.status === 'success') {
        setCurrentRoomId(roomId);
        const mRes = await fetch(`${BASE_URL}/chats/rooms/${roomId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(await mRes.json());
      }
    });
  };

  // 7. [메시지] 전송
  const sendMessage = () => {
    if (!socket || !currentRoomId || !content.trim()) return;
    socket.emit('sendMessage', { roomId: currentRoomId, content });
    setContent('');
  };

  // 8. [알림] 테스트 발송 API
  const sendTestNotification = async () => {
    await fetch(`${BASE_URL}/notifications/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type: notifParams.type,
        receiverId: notifParams.receiverId ? Number(notifParams.receiverId) : undefined
      }),
    });
  };

  return (
    <div style={{ padding: '20px', display: 'flex', gap: '20px', fontFamily: 'sans-serif', height: '90vh' }}>
      {/* 사이드바 */}
      <div style={{ width: '350px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <fieldset><legend>🔑 인증</legend>
          <input type="text" placeholder="JWT Token" value={token} onChange={e => setToken(e.target.value)} style={{ width: '95%' }} />
        </fieldset>

        <fieldset><legend>🏠 방 관리</legend>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input placeholder="MeetID" value={joinParams.meetingId} onChange={e => setJoinParams({ ...joinParams, meetingId: e.target.value })} style={{ width: '30%' }} />
            <input placeholder="LessID" value={joinParams.lessonId} onChange={e => setJoinParams({ ...joinParams, lessonId: e.target.value })} style={{ width: '30%' }} />
          </div>
          <button onClick={joinOrCreateRoom} style={{ width: '100%', marginTop: '5px' }}>방 참여/생성</button>
        </fieldset>

        <fieldset><legend>🏠 방 관리 (강사용: 학생에게 채팅걸기)</legend>
          <div style={{ display: 'flex', gap: '4px' }}>
            <input placeholder="레슨 ID" value={joinParams.lessonId} onChange={e => setJoinParams({ ...joinParams, lessonId: e.target.value })} style={{ width: '45%' }} />
            <input placeholder="수강생 ID" value={joinParams.studentId} onChange={e => setJoinParams({ ...joinParams, studentId: e.target.value })} style={{ width: '45%' }} />
          </div>
          <button onClick={joinOrCreateRoom} style={{ width: '100%', marginTop: '5px' }}>방 생성 및 채팅 시작</button>
        </fieldset>

        <fieldset style={{ flex: 1, overflowY: 'auto' }}><legend>💬 내 채팅방</legend>
          <button onClick={loadMyRooms} style={{ width: '100%', marginBottom: '10px' }}>목록 동기화</button>
          {rooms.map(r => (
            <div key={r.roomId} onClick={() => enterRoom(r.roomId)} style={{
              cursor: 'pointer', padding: '10px', borderBottom: '1px solid #eee',
              backgroundColor: currentRoomId === r.roomId ? '#030303ff' : '#353434ff'
            }}>
              <strong>#{r.roomId}</strong> {r.title}
            </div>
          ))}
        </fieldset>

        <fieldset style={{ height: '250px', overflowY: 'auto' }}><legend>🔔 알림 센터</legend>
          <button onClick={fetchNotifHistory} style={{ width: '100%', marginBottom: '10px' }}>📜 알림 기록 불러오기</button>
          <div style={{ display: 'flex', gap: '2px', marginBottom: '10px' }}>
            <select value={notifParams.type} onChange={e => setNotifParams({ ...notifParams, type: e.target.value })} style={{ flex: 1 }}>
              <option value="PARTICIPATION_REQUEST">신청</option>
              <option value="PARTICIPATION_ACCEPTED">승인</option>
              <option value="NEW_CHAT">채팅</option>
            </select>
            <button onClick={sendTestNotification}>발송</button>
          </div>
          {notifications.map((n, i) => (
            <div key={i} style={{
              padding: '8px', borderBottom: '1px solid #eee', fontSize: '0.85em',
              backgroundColor: n.isRead ? '#ee4c4cff' : '#070707ff' // 안읽음 강조
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{n.type}</strong>
                {!n.isRead && <button onClick={() => markAsRead(n.notificationId)} style={{ fontSize: '0.7em' }}>읽음</button>}
              </div>
              <div>{n.message}</div>
            </div>
          ))}
        </fieldset>
      </div>

      {/* 채팅창 */}
      <div style={{ flex: 1, border: '1px solid #ccc', display: 'flex', flexDirection: 'column', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '15px', background: '#1a73e8', color: 'white', fontWeight: 'bold' }}>
          {currentRoomId ? `Chat Room #${currentRoomId}` : '왼쪽 목록에서 방을 선택하세요.'}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '15px', background: '#f5f5f5' }}>
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: '15px', textAlign: m.senderId === 1 ? 'right' : 'left' }}>
              <div style={{ fontSize: '0.75em', color: '#888', marginBottom: '4px' }}>{m.sender?.nickname}</div>
              <div style={{
                display: 'inline-block', padding: '10px 14px', borderRadius: '12px',
                background: m.senderId === 1 ? '#1a73e8' : 'white',
                color: m.senderId === 1 ? 'white' : 'black',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}>{m.content}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
        <div style={{ padding: '15px', borderTop: '1px solid #ccc', display: 'flex', gap: '10px', background: 'white' }}>
          <input style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}
            value={content} onChange={e => setContent(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && sendMessage()} placeholder="메시지 입력..." />
          <button onClick={sendMessage} style={{ padding: '10px 20px', background: '#1a73e8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>보내기</button>
        </div>
      </div>
    </div>
  );
}

export default App;