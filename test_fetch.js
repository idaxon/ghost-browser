const http = require('http');

async function test() {
  const req = http.request('http://127.0.0.1:31506', {
    method: 'GET',
    headers: {
      'Host': 'pornhub.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    }
  }, (res) => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => {
      const buf = Buffer.concat(chunks);
      console.log('Status:', res.statusCode);
      console.log('Headers:', res.headers);
      console.log('Snippet:', buf.toString('utf8').substring(0, 500));
    });
  });
  req.end();
}

test();
