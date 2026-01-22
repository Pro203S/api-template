import net from 'net';

/**
 * 특정 포트가 사용 중인지 확인하는 함수
 * @param port 확인할 포트 번호
 * @returns boolean (true = 사용 중, false = 사용 가능)
 */
export default function isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(true); // 포트 사용 중
                } else {
                    resolve(false); // 다른 에러는 사용 가능으로 취급
                }
            })
            .once('listening', () => {
                tester.close(() => resolve(false)); // 사용 가능
            })
            .listen(port);
    });
}