import express from 'express';
import { QueueProtection } from './middleware.js';

const app = express();

const qprotect = new QueueProtection({ queueConcurrency: 8 });
app.use(qprotect.qprotect);

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});

