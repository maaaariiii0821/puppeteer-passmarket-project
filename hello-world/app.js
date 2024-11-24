//const puppeteer = require('puppeteer-core');
const puppeteer = require('puppeteer-extra');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

//色んな設定項目//
// ログインURLとチケットURL
const ticketURL = 'https://passmarket.yahoo.co.jp/order/buy/edit?event_id=02p32pmyxy041';

// 指定時刻 (24時間形式: 時、分、秒)
const targetHour = 0;  // 指定の時刻
const targetMinute =  0; // 指定の分
const targetSecond = 0; // 指定の秒

// ページ更新間隔 (ミリ秒単位)
const prepare_time = 15000; // 何秒前から更新を始めるか
const buffer = 200;

// 計測回数
const measurementCount = 15;
//ここまで//

// ブラウザを起動
async function launchBrowser() {
    try{
        // Puppeteerのブラウザを起動
        const browser = await puppeteer.launch({
            executablePath: await chromium.executablePath(), 
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            //headless: chromium.headless,
            headless: true,
        });
        return browser;
    }catch(error){
        console.error('Browser launch error:', error);
        throw error;
    }
}

// ネットワーク遅延を計測する関数
async function measureNetworkDelay(page, url) {
    const startTime = Date.now();
    await page.evaluate(url => {
        return fetch(url).then(response => response.text());
    }, url);
    const delay = Date.now() - startTime;
    return delay;
}

// ミリ秒まで表示するためのフォーマット関数
function getFormattedTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');

    // 日本時間を表示するためのタイムゾーンを設定
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds} (JST)`;
}


exports.lambdaHandler = async (event, context) => {
    let browser;
    try {
        // 入力データを確認するためのログ
        console.log('受信したデータ:', JSON.stringify(event));
        const data = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        // event.bodyの存在を確認
        if (!event.body) {
            console.error('Request body is missing');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Request body is missing" })
            };
        }

        // 受け取ったデータを取得
        //const data = JSON.parse(event.body);
        const ticketURL = data.ticketURL;
        const targetHour = data.targetHour;
        const targetMinute = data.targetMinute;
        const targetSecond = data.targetSecond;
        const prepare_time = data.prepare_time;
        const buffer = data.buffer;
        const measurementCount = data.measurementCount;
        

        // 以降の処理は既存の処理をそのまま使用
        console.log(`Received Data: URL=${ticketURL}, Hour=${targetHour}, Minute=${targetMinute}, Second=${targetSecond}`);


        // ブラウザを起動
        const browser = await launchBrowser();
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');

        // 事前に保存したクッキーを設定 なるべくいつも最新のクッキーを！！！！！
        const cookies = JSON.parse(fs.readFileSync('./cookies.json', 'utf-8'));
        await page.setCookie(...cookies);

        //購入作業開始
        ticketURL2 = "https://passmarket.yahoo.co.jp/order/buy/edit?event_id="+ticketURL;
        await page.goto(ticketURL2);
        console.log('販売ページにアクセスできました:'+ticketURL2)

        //購入時間まで待つ
        // 指定時刻まで待機
        const targetTime = new Date();;
        targetTime.setHours(targetHour, targetMinute, targetSecond, 0);
        // 現在の日本時間を取得
        const now = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算;
        const waitTime = targetTime - prepare_time - now; //開始時刻―現在時刻で開始時刻までのmsを取り、そこからNW遅延計測分を前倒しする
        
        console.log(`現在時刻は ${getFormattedTime(now)}`);
        console.log(`指定時刻は ${targetTime}`);
        
        if (waitTime > 0) {
            console.log(`指定時刻の${prepare_time / 1000}秒前まで待機します (あと${waitTime / 1000}秒)。`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
            console.log('指定時刻は既に過ぎています。');
        }

        console.log(`ネットワーク遅延を計測します。`);
        // ネットワーク遅延を計測
        let totalNetworkDelay = 0;
        for (let i = 0; i < measurementCount; i++) {
            const delay = await measureNetworkDelay(page, ticketURL);
            if (i != 0){
               totalNetworkDelay += delay;
               console.log(`Measurement ${i + 1}: ${delay} ms`);
            }
            
        }
        const averageNetworkDelay = totalNetworkDelay / (measurementCount-1);
        console.log(`平均NW遅延: ${averageNetworkDelay} ms`);
        const now2 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算、NW遅延計測後の時刻
        console.log(`現在の時刻:  ${getFormattedTime(now2)}`);
        console.log(`指定時刻:${targetTime}`);
        console.log(`差分:${targetTime-now2}`);
        const waitTime2 = targetTime- now2 - averageNetworkDelay  + buffer;//開始時刻―現在時刻で残り時間を取り、そこからNW遅延分を前倒しする。安全のためにバッファ分後ろ倒しする。
        console.log(`${waitTime2 / 1000}秒待ちます。`);

        if (waitTime2 > 0) {
            // 指定時刻の直前まで高精度に待機
            await new Promise(resolve => setTimeout(resolve, waitTime2));
        }

        const now3 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算
        console.log(`更新開始します。${getFormattedTime(now3)}`);

        //枚数選択
        try {
            // リロードを実行してページをリロードする
            await page.reload();
            const now4 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算
            console.log(`発売開始時刻になり更新完了しました。${getFormattedTime(now4)}要素をクリックします。`);
            //次へ
            //await new Promise(resolve => setTimeout(resolve, 1000));
            await page.click('xpath=/html/body/div[1]/div/section[2]/div/div/form/div/div[2]/a');
            const now_next = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算
            console.log(`次へを選択できました:${getFormattedTime(now_next)}`);

            //支払い方法選択
            await new Promise(resolve => setTimeout(resolve, 500));
            await page.click('xpath=/html/body/div/div[1]/section[2]/div/div/form/div/ul/li[3]/section/label/input');
            const now_conv = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算
            console.log(`コンビニを選択できました:${getFormattedTime(now_conv)}`)

            //await new Promise(resolve => setTimeout(resolve, 1000));
            await page.click('xpath=/html/body/div/div[1]/section[2]/div/div/div/a');
            const now_conf = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算
            console.log(`確認をクリックできました:${getFormattedTime(now_conf)}`)

            //await new Promise(resolve => setTimeout(resolve, 1000));
            //await page.click('xpath=/html/body/div/div/section[2]/div/div/div[1]/div/a');
            console.log('購入完了')
            const now5 = new Date(new Date().getTime() + 9 * 60 * 60 * 1000); // 9時間を加算
            console.log(`終了時刻は${getFormattedTime(now5)}`);

            await browser.close();

        } catch (error) {
            console.error('購入フロー中にエラーが発生しました:', error);
        }
        
    } catch (error) {
        console.error('Lambda関数内でエラーが発生:', error);
        throw error;  // エラーをLambdaに通知
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'サーバーでエラーが発生しました' })
        };
    }
};