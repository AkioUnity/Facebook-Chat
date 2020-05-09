const Hapi = require('hapi');
const sleep = require('thread-sleep');
const base64 = require('base64-url');

const _ = require('lodash');
const puppeteer = require("puppeteer-extra")
const pluginStealth = require("puppeteer-extra-plugin-stealth")
puppeteer.use(pluginStealth())

const password = 'FREElancer2017';
const cvv = '311';
let tools = require('./tools');
let reload = require('./reload_action');

let mysql_connection = require("./mysql_connection");

let connection = mysql_connection.pool;

// const isTest=true;
const isTest = false;

const getTheStrings = async (username = 'no') => {
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            `--no-sandbox`,
            `--window-size=1280,900`,
            `--deterministic-fetch`
        ]
        // devtools: true
    });

    const page = await browser.newPage();

    // Connect to Chrome DevTools
    await page.target().createCDPSession();

    if (username == 'no') {
        return {page, browser};
    }
    console.log(username, ": ");
    await page.goto('https://www.costco.com/LogonForm', {waitUntil: 'load'});
    //Logon
    console.log(username, ": 0");
    await page.waitForSelector('#LogonForm');
    console.log(username, ": 1");
    if (mysql_connection.isAkio) {
        await page.type('#postal-code-input', "45034");
        await Promise.all([
            page.waitForNavigation({waitUntil: 'load'}),
            page.click('#postal-code-submit')
        ]);
    }
    sleep(3000);
    console.log("login id:", username);
    await page.type('#logonId', username);
    await page.type('#logonPassword', password);
    sleep(1000);
    //await page.screenshot({path: 'Logon.png'});

    await Promise.all([
        page.waitForNavigation({waitUntil: 'load'}),
        page.click('input[value="Sign In"]')
    ]);
    console.log("wait For Navigation");
    return {page, browser};
};

// find the link, by going over all links on the page
async function findByLink(page, linkString) {
    const links = await page.$$('a');

    const matches = [];
    await Promise.all(links.map(async l => {
        let valueHandle = await l.getProperty('innerText');
        let linkText = await valueHandle.jsonValue();
        const text = getText(linkText);
        if (linkString === text) {
            matches.push(l);
        }
    }));

    return matches;
}

async function updateItem(id, data) {
    return await connection.query(`` +
        `UPDATE orders ` +
        `SET ` +
        `costco_order_id = ${data.costco_order_id}, ` +
        `shipping_charge = '${data.shipping_charge}', ` +
        `tax = '${data.tax}', ` +
        `total = '${data.total}', ` +
        `created = '${data.created}' ` +
        `WHERE id = ${id}`);
}

async function insertTrackingNumber(id, track) {
    return await connection.query(`UPDATE orders SET track_number = '${track}' WHERE id = ${id}`);
}

async function insertMultipleTrackingNumber(costco_order_id, track, email) {
    let queryString = `UPDATE orders SET track_number = ${track}' WHERE costco_order_id = ${costco_order_id} and email='${email}'`;
    // let queryString = `UPDATE orders SET track_number = CONCAT(ifnull(track_number, ''), ' ','${track}') WHERE costco_order_id = ${costco_order_id} and email='${email}'`;
    console.log(queryString);
    return await connection.query(queryString);
}

async function insertMultipleTrackingNumberWithAddress(costco_order_id, track, address1, email) {
    // let queryString = `UPDATE orders SET track_number = CONCAT(ifnull(track_number, ''), ' ','${track}') WHERE costco_order_id = ${costco_order_id} and ship_address_1 LIKE '%${address1}%'  and email='${email}'`;
    let queryString = `UPDATE orders SET track_number ='${track}' WHERE costco_order_id = ${costco_order_id} and ship_address_1 LIKE '%${address1}%'  and email='${email}'`;
    // console.log(queryString);
    return await connection.query(queryString);
}

async function updateTrackingNumber(costco_order_id, track, email) {
    return await connection.query(`UPDATE orders SET track_number = '${track}' WHERE costco_order_id = ${costco_order_id} and email='${email}'`);
}


const placeOrder = async (request, h) => {
    const orderId = request.payload["id[]"];
    let isMultiple = request.payload["isMultiple"];
    let email = request.payload["email"];
    console.log(email, "Starting:", orderId);
    let status = await tools.GetWaits(email);
    console.log(email, status);
    if (status != 'done')
        return {'success': 'false', 'msg': 'Already Running'};
    const ids = (typeof orderId == 'Array') ? orderId.join() : orderId;
    console.log("Starting:", ids);
    const [rows] = await connection.query('SELECT * FROM `orders` WHERE id IN (' + ids + ')');

    const errors = [];

    tools.UpdateWaits(email, 'Starting... isMultiple:' + isMultiple);
    isMultiple = (isMultiple == 'true');
    const {page, browser} = await getTheStrings(email);
    tools.UpdateWaits(email, 'logined');
    await page.goto('https://www.costco.com/CheckoutCartView', {waitUntil: 'load', timeout: 3000000});

    if (!isTest) {
        try {

            sleep(1500);
            while (removes = await findByLink(page, "Remove")) {
                if (removes.length == 0) {
                    break;
                }
                await Promise.all([
                    page.waitForNavigation({waitUntil: 'load'}),
                    removes[0].click()
                ]);
                sleep(500);
            }
        } catch (e) {
            console.log(email, e);
            errors.push(e);
        }
        for (let p of rows) {
            //Go To Cart and Clear
            try {
                //Options
                //const opts = ["1003144"];//1174026-7000000000000459167-7000000000000328600".split("-");
                const opts = p.product_number.split("-");

                //Go To Product
                //await page.goto(`https://www.costco.com/.product.9757565.html`, {waitUntil: 'load', timeout: 3000000});
                await page.goto(`https://www.costco.com/.product.${opts[0]}.html`, {
                    waitUntil: 'load',
                    timeout: 3000000
                });

                //There is a variation
                if (opts[1] && opts[1].length > 3) {
                    await page.select("#productOption00", opts[1]);
                }

                if (opts[2] && opts[2].length > 3) {
                    const select = await page.$("#productOption01");
                    const disabled = await page.evaluate((select, val) => {
                        for (let option of select.options) {
                            if (option.value == val) {
                                return option.disabled;
                            }
                        }
                        return true;
                    }, select, opts[2]);
                    console.log(disabled);
                    if (disabled) {
                        p.skip = true;
                        continue;
                    }
                    await page.select("#productOption01", opts[2]);
                }

                //add qty
                //await page.evaluate( () => {
                //$('#minQtyText').val('');
                //});
                // console.log(email,p);
                await WaitForSelector(page, email, '#minQtyText');
                sleep(500);
                await page.click("#minQtyText", {clickCount: 3});
                sleep(200);
                await page.keyboard.press('Backspace');
                sleep(200);
                await page.keyboard.press('Backspace');
                sleep(200);
                await page.type('#minQtyText', p.quantity_purchased);

                //Check for backorder
                const productBackorder = await page.evaluate("$('#backorder-message').text()");

                await page.click('#add-to-cart-btn');
                sleep(1000);

                if (productBackorder && productBackorder != "") {
                    sleep(1000);
                    console.log(email, opts[0], productBackorder);
                    const isHidden = await page.$eval('#costcoModalBtn2', (elem) => {
                        return window.getComputedStyle(elem).getPropertyValue('display');
                    });
                    console.log(isHidden);
                    if (isHidden != 'none') {
                        sleep(30000000);
                        await page.click('#costcoModalBtn2');
                    } else
                        console.log('not found');
                    sleep(1000);
                }

                sleep(1000);

                //Check for error
                const productError = await page.evaluate("$('div.error').text()");
                if (productError && productError != "") {
                    // throw new Error("Product Error", productError,p.product_number);
                    console.log("Product Error", productError, p.product_number);
                }
                if (isMultiple) {  //multiple
                    sleep(1000);
                    console.log(email, "continue multileaddress");
                    continue;
                }
                //Go to Cart
                await page.goto('https://www.costco.com/CheckoutCartView', {waitUntil: 'load', timeout: 100000});
                //Start checkout
                await page.waitFor(2000);

                if (p.ship_service == 1) {
                    await page.evaluate(() => {
                        let elements = $('input[type="radio"] [name="shipModeId_1"]').toArray();
                        for (let i = 0; i < elements.length; i++) {
                            if ($(elements[i]).getAttribute('value') == '11153') {
                                $(elements[i]).click();
                            }
                        }
                    });
                }

                await page.waitForSelector('#shopCartCheckoutSubmitButton', {visible: true});  //signle
                await page.waitFor(1000);

                await page.$eval('#shopCartCheckoutSubmitButton', elem => elem.click());

                await AddAddressSingle(page, p, email);

                sleep(1000);
                // Add billing info
                const data = await AddPayment(page, email);  //single order

                // console.log(email, "Update", p.id, data);
                await updateItem(p.id, data);
                await page.waitFor(3000);

                await reload.LastPageForOrder(page,email);
                // await Promise.all([
                //     page.waitForNavigation({waitUntil: 'load'}),
                //
                // ]);
                await page.waitFor(3000);
            } catch (e) {
                console.log(email, e);
                errors.push(e);
                if (mysql_connection.isAkio) {
                    return {'success': 'false', 'msg': ''};
                } else
                    return {'success': 'false', 'msg': ''};
                // continue;
            }
        }
    }
    try {
        if (isMultiple) {
            //Start checkout
            sleep(2000);
            await page.goto('https://www.costco.com/CheckoutCartView', {waitUntil: 'load', timeout: 3000000});
            tools.UpdateWaits(email, 'remove from Checkout');
            sleep(3000);

            await Promise.all([
                page.waitForNavigation({waitUntil: 'load'}),
                page.click('#shopCartCheckoutSubmitButton')
            ]);

            await page.$eval('#ShipAsCompleteForm', form => form.submit());
            sleep(1000);
            let id = 0;
            const itemArray = await page.evaluate(
                () => [...document.querySelectorAll('.number')].map(elem => elem.innerText)
            );
            console.log(email, itemArray);
            let cn = {};
            let count = 0;
            for (let p of rows) {
                if (p.skip) {
                    console.log(email, "skip");
                    continue;
                }
                const opts = p.product_number.split("-");
                const item_id = opts[0];
                let index = itemArray.indexOf(item_id);
                if (index < 0) {
                    console.log(email, "Error: Item ID not found in CheckoutShippingView");
                    throw new Error('Item ID not found in CheckoutShippingView');
                }
                if (cn[item_id] === undefined)
                    cn[item_id] = 0;
                index = index + cn[item_id];

                for (let i = 0; i < p.quantity_purchased; i++) {
                    try {
                        id++;
                        index++;
                        cn[item_id]++;
                        tools.UpdateWaits(email, id + ":" + index + " " + item_id);
                        // console.log(email, id + ":" + index + " " + item_id, cn[item_id], i);
                        if (count > 5) {
                            count = 0;
                            await page.evaluate(() => {
                                location.reload(true)
                            });
                            await page.waitFor(2000);
                        }
                        await page.click('#addressId_' + index);
                        sleep(1000);
                        // await page.waitForSelector('#addressId_' + index);
                        await page.select('#addressId_' + index, 'Add New Address');
                        await page.waitForSelector('#costcoModal', {visible: true});
                        await page.waitForSelector('#address-modal-modal', {visible: true});

                        await page.keyboard.press("Enter");

                        await AddAddress(page, p, email); //multiple

                        await page.waitForSelector('#save-address-modal', {visible: true});

                        await page.evaluate(() => {
                            $('#save-address-modal').click();
                        });

                        // await page.screenshot({path: "screens/"+id + "_" + item_id +'.png'});
                        sleep(500);

                        await page.waitForSelector('#costcoModalBtn2', {visible: true});
                        await page.click('#costcoModalBtn2');
                        // Wait for Modal to open with address confirm
                        sleep(1000);

                        await page.waitForSelector('#costcoModalText', {visible: true});
                        await page.evaluate(() => {
                            $('#entered-address > input[value="entered"]').click();
                        });

                        // await page.keyboard.press("Enter");
                        // page.waitForNavigation({ waitUntil: 'load' }),
                        // await page.screenshot({path: "screens/"+id + "_" + item_id +'_popup.png'});
                        sleep(1000);
                        await page.waitForSelector('#costcoModalBtn2', {visible: true});
                        await page.evaluate(() => {
                            $('#costcoModalBtn2').click();
                        });
                        tools.UpdateWaits(email, id + ":finished");
                        sleep(5000);
                    } catch (e) {
                        console.log(email, e);
                        // errors.push(e);
                        if (e.string().includes('Session closed.'))
                            return;
                        console.log(email, "will try again");
                        id--;
                        index--;
                        cn[item_id]--;
                        i--;
                    }
                }
            }

            await page.goto('https://www.costco.com/CheckoutPaymentView', {waitUntil: 'load', timeout: 3000000});
            // await Promise.all([
            //     page.waitForNavigation({ waitUntil: 'load' }),
            //     page.evaluate(() => {
            //         $('[value="Continue"]').click();
            //     })
            // ]);
            sleep(1000);
            tools.UpdateWaits(email, "will start AddPayment");


            const data = await AddPayment(page, email);  //isMultiple

            for (let p of rows) {
                if (p.skip) {
                    continue;
                }
                // console.log(email, "Update", p.id, data);
                await updateItem(p.id, data);   //isMultiple
            }
            await page.waitFor(3000);
            await page.waitForSelector("[name='place-order']", {visible: true});
            await page.click("[name='place-order']");  //isMultiple

            await page.waitFor(2000);
            await page.waitForSelector("[name='continue-shopping']", {visible: true});  //CheckoutConfirmationView page
            await page.click("[name='continue-shopping']");  //Continue Shopping Button
            await page.waitFor(4000);
        }
    } catch (e) {
        console.log(email, e);
        errors.push(e);
    }


    const data = {'success': 'true', 'msg': ''};
    if (errors.length > 0) {
        data.success = false;
        data.msg = errors.join();
        tools.UpdateWaits(email, "finished");
    } else {
        tools.UpdateWaits(email, "success");
        await browser.close();
    }
    console.log(email, "return:", data);
    return data;
};

async function AddPayment1(page, email) {
    await page.click("#radio-credit-card");
    await page.waitFor(500);
    await page.waitForSelector("#cc_expiry_date", {visible: true});
    await page.click('#cc_expiry_date');  //this is very important (don't change as eval  ele.click
    // await page.click('#cvv-tooltip');  //this is very important (don't change as eval  ele.click
    // await page.$eval('#cc_expiry_date', elem => elem.click()); //Continue to Payment
    await page.waitFor(500);
    await page.keyboard.press('Tab');  //this is also very important due to iframe .. can't click  ccv input
    // await page.waitFor(500);
    // await page.keyboard.press('Tab');
    await page.waitFor(1000);
    console.log(email, "click keyboard cvv");
    for (let i = 0; i < cvv.length; i++) {
        await page.keyboard.type(cvv[i]);
        await page.waitFor(500);
    }

    await page.waitForSelector(".primary-button-green-v2", {visible: true});
    //Place order / review
    await page.waitFor(1000);
    let clicker = ".primary-button-green-v2";
    await page.$eval(clicker, elem => elem.click()); //Continue to Payment
    await page.waitFor(2000);
}

async function AddPayment(page, email) {
    await AddPayment1(page, email);

    let selector = '#ShipAsCompleteFormShippingOptions';

    try {
        await page.waitForSelector(selector, {visible: true, timeout: 5000});
    } catch (e) {
        console.log(e);
        console.log(email, page.url());
        await page.goto(page.url(), {waitUntil: 'load', timeout: 3000000});
        // await page.evaluate(() => {
        //     location.reload(true)
        // });
        await page.waitFor(2000);
        await AddPayment1(page, email);
        await page.waitForSelector(selector, {visible: true, timeout: 5000});
    }


    // selector = '#order-summary-body div:nth-of-type(3) h3:nth-of-type(2)';
    // await page.waitForSelector(selector, {visible: true, timeout: 5000});
    // sleep(500);
    const rawShipping = '0';//await page.evaluate("$('#order-summary-body div:nth-of-type(3) h3:nth-of-type(2)').val()");
    // sleep(500);
    const rawTax = '0';//await page.evaluate("$('#order-summary-body div:nth-of-type(3) h3:nth-of-type(4)').val()");
    const orderId = await page.evaluate("$('[name=orderId]').val()");
    // sleep(500);
    const rawTotal = await page.evaluate("$('[name=outstandingPrincipal]').val()");

    // console.log(email,orderId);
    // console.log(email,rawShipping);
    // console.log(email,rawTax);
    // console.log(email,rawTotal);
    const data = [];
    data['costco_order_id'] = orderId;
    data['shipping_charge'] = rawShipping.replace('$', '').trim();
    data['tax'] = rawTax.replace('$', '').trim();
    if (isNaN(rawTotal))
        data['total'] = rawTotal.replace('$', '').trim();
    else
        data['total'] = rawTotal;
    data['total'] = (Math.round(data['total'] * 100) / 100).toFixed(2);
    console.log(data['total']);
    data['created'] = new Date().toISOString().slice(0, 19).replace('T', ' ');

    return data;
}

async function AddAddressSingle(page, p, email) {
    await AddAddress(page, p, email);  //single

    await page.evaluate(() => {
        $('#set-default-inline').click();
        $('#save-address-inline').click();
    });
    await page.waitFor(500);
    await page.waitForSelector(".primary-button-green-v2", {visible: true});
    // await page.click("[name='place-order']");
    await page.$eval(".primary-button-green-v2", elem => elem.click());
    await page.waitFor(3000);

    try {
        await Promise.all([
            page.waitForNavigation({waitUntil: 'load'}),
            page.evaluate(() => {
                $('[value="entered"]').click();
                $('#costcoModalBtn2').click();
            })
        ]);
    } catch (e) {
        console.log(email, 'reload address page----Address page',page.url());
        await page.goto(page.url(), {waitUntil: 'load', timeout: 3000000});
        // await page.evaluate(() => {
        //     location.reload(true)
        // });
        await page.waitFor(2000);
        await AddAddressSingle(page, p, email);
    }
}

async function AddAddress(page, p, email) {
    const names = p.recipient_name.split(" ");
    const nameRemainder = p.recipient_name.replace(names[0], "").trim();
    const lastName = (nameRemainder != "") ? nameRemainder : names[0];
    await page.waitFor(1000);
    await page.waitForSelector('#S_firstId', {visible: true});
    // await WaitForSelector(page, email, '#firstId');
    await page.type("#S_firstId", names[0], {delay: 100});
    await page.waitFor(500);
    await page.type("#S_lastId", lastName, {delay: 100});
    await page.waitFor(500);
    await page.type("#S_address1Id", p.ship_address_1, {delay: 100});
    await page.waitFor(500);
    if (p.ship_address_2){
        await page.click("#showAptField");
        await page.waitForSelector('#address2Id', {visible: true});
        await page.type("#address2Id", p.ship_address_2, {delay: 100});
    }

    const post = p.ship_postal_code.split("-");
    // console.log(email, 'postal_code:', post);
    // await page.waitFor(1000);
    await page.waitForSelector('#S_postalId', {visible: true});
    await page.click("#S_postalId", {delay: 500, clickCount: 2});
    for (let i = 0; i < post[0].length; i++) {
        // console.log(email,'postal:',i,post[0][i]);
        await page.type("#S_postalId", post[0][i]);
        sleep(500);
    }
    await page.waitForSelector('#S_cityId', {visible: true});
    sleep(1000);
    //If city/state didn't populate, fill them
    const cityValue = await page.evaluate("$('#S_cityId').val()");
    const stateValue = await page.evaluate("$('#S_stateId').val()");

    // console.log(email, "City", cityValue, "State", stateValue);

    if (!cityValue || cityValue == '') {
        await page.click("#S_cityId", {clickCount: 3});// post[0][i]);
        await page.type("#S_cityId", p.ship_city);
    }

    //if(!stateValue || stateValue == '') {
    //await page.select("#stateId", p.ship_state);
    //}

    sleep(500);

    await page.type("#S_emailId", "gtscostco@gmail.com");
    sleep(500);
    await page.waitForSelector('#S_phoneId', {visible: true});
    const phone = p.buyer_phone_number.replace("-", "");
    for (let i = 0; i < phone.length; i++) {
        await page.type("#S_phoneId", phone[i]);
        sleep(100);
    }
}

// Track Orders
const trackOrder = async (request, h) => {
    const orderId = request.payload["id[]"];
    let isMultiple = request.payload["isMultiple"];
    let email = request.payload["email"];
    console.log(email, "Track Starting:", orderId);
    let status = await tools.GetWaits(email);
    console.log(email, status);
    if (status != 'done')
        return {'success': 'false', 'msg': 'Already Running'};
    const ids = (typeof orderId == 'Array') ? orderId.join() : orderId;

    tools.UpdateWaits(email, 'Starting... isMultiple:' + isMultiple);
    isMultiple = (isMultiple == 'true');

    let query = "select id, costco_order_id from orders where id IN (" + ids + ") and costco_order_id>0 and (length(track_number)<10  or track_number Is NULL or track_number IN ('Not Found', 'Cancelled'))";
    if (isMultiple)
        query = "select costco_order_id from orders where id IN (" + ids + ") and costco_order_id>0 and (length(track_number)<10  or track_number Is NULL or track_number IN ('Not Found', 'Cancelled')) GROUP BY costco_order_id";

    const [rows] = await connection.query(query);
    console.log("Rows", rows);
    if (rows.length == 0) {
        tools.UpdateWaits(email, "success");
        return {'success': 'true', 'msg': ''};
    }


    // Load Up Puppeteer and Login to costco
    const {page, browser} = await getTheStrings(email);
    console.log("Page and Browser");
    const errors = [];
    for (let r of rows) {
        try {
            sleep(1000);
            await page.goto(
                `https://www.costco.com/OrderStatusDetailsView?langId=-1&storeId=10301&catalogId=10701&orderId=${r.costco_order_id}`,
                {waitUntil: 'load', timeout: 3000000}
            );
            await page.waitForSelector('#tiles-body-attribute', {visible: true});
            const orderId = await page.evaluate("$('#orderId').val()");
            console.log(email, "OrderID", orderId);
            if (!orderId || orderId == '' || orderId == 'undefined') {
                if (isMultiple)
                    await updateTrackingNumber(r.costco_order_id, 'Not Found', email);
                else
                    await insertTrackingNumber(r.id, 'Not Found');
                // throw new Error('Bad order');
                console.log(email, "Order not Found");
                continue;
            }

            //Record and move on for cancelled orders
            const cancelled = await page.evaluate("$(\"p:contains('Cancelled')\").length;");
            if (cancelled && cancelled > 0) {
                if (isMultiple)
                    await updateTrackingNumber(r.costco_order_id, 'Cancelled', email);
                else
                    await insertTrackingNumber(r.id, 'Cancelled');
                throw new Error('Cancelled');
            }

            let links = await page.evaluate(() => {
                let text = [];
                let elements = document.getElementsByClassName('col-md-3 col-xl-3 col-lg-3 col-sm-3 col-xs-12 flbox hidden-md hidden-sm hidden-xs order-details-item-shipping-details');
                for (let element of elements) {
                    let str = element.innerText;
                    let pos = str.indexOf('Tracking#');
                    if (pos > 0) {
                        str = str.substr(pos + 10);
                        text.push(str);
                    } else
                        text.push("");
                }
                return text;
            });
            console.log(email, links);
            if (isMultiple) {
                let address = await page.evaluate((i) => {
                    let text = [];
                    let elements = document.querySelectorAll('.table_box_outer');
                    if (elements.length == 0)
                        return null;
                    let cn = 0;
                    let before = null;
                    for (let element of elements) {
                        let idStr = element.id;
                        idStr = idStr.replace('outer_', '');
                        let id = parseInt(idStr);
                        for (let j = cn; j < id; j++) {
                            text.push(before.innerText);
                        }
                        text.push(element.innerText);
                        cn = id + 1;
                        before = element;
                    }
                    return text;
                });
                console.log(email, address);
                if (address == null) {
                    const trackingNumbers = [...new Set(links)].join();
                    if (trackNumber != '')
                        await insertMultipleTrackingNumber(r.costco_order_id, trackingNumbers, email);
                    continue;
                }
                if (address.length < links.length) {
                    for (let i = address.length; i < links.length; i++)
                        address.push(address[address.length - 1]);
                    console.log(email, address);
                }

                for (let i = 0; i < links.length; i++) {
                    let trackNumber = links[i];
                    let address0 = address[i];

                    let name = address0.split('\n')[1];
                    name = name.replace(/\u00a0/g, " ");
                    console.log(name);
                    let address1 = address0.split('\n')[2];
                    address1 = address1.replace(/\u00a0/g, " ");
                    console.log(email, address1);
                    // await insertMultipleTrackingNumber(r.costco_order_id, trackNumber,name);
                    if (trackNumber != '')
                        await insertMultipleTrackingNumberWithAddress(r.costco_order_id, trackNumber, address1, email);
                }
            } else {
                const trackingNumbers = [...new Set(links)].join();
                await insertTrackingNumber(r.id, trackingNumbers);
            }

        } catch (e) {
            console.log(email, e);
            errors.push(e);
            continue;
        }
    }

    const data = {'success': 'true', 'msg': ''};
    if (errors.length > 0) {
        data.success = false;
        data.msg = `There were ${errors.length} error(s)`;
        tools.UpdateWaits(email, "finished");
    } else {
        tools.UpdateWaits(email, "success");
        await browser.close();
    }
    return data;
}

const updatePrice = async (id, priceData) => {
    let update = [];
    for (let key in priceData) {
        update.push(key + " = '" + priceData[key] + "'");
    }

    return connection.query(`UPDATE prices SET ${update.join(', ')} WHERE id = ${id}`);
}

//Price Check
const priceCheck = async (request, h) => {
    const orderId = request.payload["id[]"];
    let email = request.payload["email"];
    console.log("Starting:", orderId);
    const couponRegex = /\$([0-9.]+) manufacturer(\’|\')s (savings|discount)[*]* is valid ([^.]*) through ([^.]*)/;
    const ids = (typeof orderId == 'Array') ? orderId.join() : orderId;
    const [rows] = await connection.query('SELECT * FROM `prices` WHERE id IN (' + ids + ')');
    const errors = [];
    const {page, browser} = await getTheStrings();
    for (let p of rows) {
        console.log(p);
        //Go To Product
        let priceData = {
            regular_price: '',
            s_h: '',
            coupon: '',
            coupon_start: '',
            coupon_end: '',
            final_price: '',
            out_of_stock: 'ERROR'
        }

        try {
            const itemNumbers = p.costco_number.split("-");
            //await page.goto(`https://www.costco.com/.product.677772.html`, {waitUntil: 'load', timeout: 3000000});
            await page.goto(`https://www.costco.com/.product.${itemNumbers[0]}.html`, {
                waitUntil: 'load',
                timeout: 3000000
            });
            const products = await page.evaluate(() => (typeof products !== 'undefined') ? products[0] : false);
            const options = await page.evaluate(() => (typeof options !== 'undefined') ? options[0] : false);
            const sh = await page.evaluate("$('#shipping-statement').text().split('$')");

            if (!products) {
                throw new Error("Error with product " + itemNumbers[0]);
            }

            const addToCart = await page.evaluate("$('#add-to-cart-btn').val();");
            console.log("Add to Cart", addToCart);
            if (!addToCart || addToCart == 'Out of Stock') {
                throw new Error('Item not available');
            }
            //Coupon
            const couponText = await page.evaluate(() => {
                var text = '';
                var coupon = $('.PromotionalText');
                if (coupon) {
                    text = $(coupon).text();
                }

                return text;
            });
            console.log("Coupon Text", couponText);

            const couponData = couponText.match(couponRegex);
            let couponValue = 0;
            console.log("CD", couponData);
            if (couponData && couponData.length == 6) {
                console.log("Coupon Data", couponData);
                couponValue = couponData[1];
                priceData.coupon = couponData[1];
                priceData.coupon_start = couponData[4];
                priceData.coupon_end = couponData[5];
            }

            console.log("Raw Product", products);
            console.log("CouponData", couponData, couponValue);
            //Product with no options
            if (itemNumbers.length == 1 && products[0]) {
                if (products[0].inventory == 'IN_STOCK') {
                    priceData.out_of_stock = '';
                }

                const price = parseFloat(base64.decode(products[0].price), 2);
                const lPrice = parseFloat(base64.decode(products[0].listPrice), 2);
                priceData.regular_price = price;
                console.log(price, lPrice, (lPrice > price));
                if (lPrice > price) {

                    priceData.regular_price = lPrice;
                }
            }

            const optionList = itemNumbers.slice(1, itemNumbers.length);
            // If we are a product with options
            if (optionList.length > 0 && products.length > 1) {
                const correctProduct = products.filter(p => _.difference(optionList, p.options).length == 0);
                if (correctProduct && correctProduct[0]) {

                    const price = parseFloat(base64.decode(correctProduct[0].price), 2);
                    const lPrice = parseFloat(base64.decode(correctProduct[0].listPrice), 2);
                    priceData.regular_price = price;
                    if (lPrice > price) {
                        priceData.regular_price = lPrice;
                    }

                    console.log("XP", base64.decode(correctProduct[0].price));
                    console.log("XLP", base64.decode(correctProduct[0].listPrice));
                }
                if (correctProduct[0].inventory == 'IN_STOCK') {
                    priceData.out_of_stock = '';
                }
            }

            //Shipping
            if (sh[1]) { //We found a dollar price
                priceData.s_h = sh[1].replace('*', '');
            } else {
                priceData.s_h = '0.00';
            }


            //Final Price
            priceData.final_price = parseFloat(
                (parseFloat(priceData.regular_price) - parseFloat(couponValue)) +
                parseFloat(priceData.s_h)
            ).toFixed(2);

            //Get Cats
            console.log(priceData);
        } catch (e) {
            console.log(e.message);
            errors.push(e);
        }

        await updatePrice(p.id, priceData);
    }
    await browser.close();
    const data = {'success': 'true', 'msg': ''};
    if (errors.length > 0) {
        data.msg = errors.join();
    }
    return data;
}

// Create a server with a host and port
const server = Hapi.server({
    host: 'localhost',
    port: 8111
});

// Add the route
server.route({
    method: 'POST',
    path: '/placeOrder',
    handler: placeOrder
});

server.route({
    method: 'POST',
    path: '/updateTrack',
    handler: trackOrder
});

server.route({
    method: 'POST',
    path: '/makeCheck',
    handler: priceCheck
});
//Start the web server
process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit();
});

// Normalizing the text
function getText(linkText) {
    linkText = linkText.replace(/\r\n|\r/g, "\n");
    linkText = linkText.replace(/\ +/g, " ");

    // Replace &nbsp; with a space
    var nbspPattern = new RegExp(String.fromCharCode(160), "g");
    return linkText.replace(nbspPattern, " ").trim();
}

(async () => {
    await server.register({
        plugin: require('hapi-cors'),
        options: {
            origins: ['http://localhost:3000', 'http://localhost']
        }
    })
    await server.start();
    console.log(`Server starting at: ${server.info.uri}`);
})();


async function WaitForSelector(page, email, selector) {
    try {
        await page.waitForSelector(selector, {visible: true, timeout: 5000});
    } catch (e) {
        // console.log(email, e);
        // if (e.string().includes('Session closed.'))
        //     return;
        console.log(email, page.url());
        console.log(email, "refresh browser again for " + selector);
        await page.goto(page.url(), {waitUntil: 'load', timeout: 3000000});
        await page.waitFor(2000);
        await page.waitForSelector(selector, {visible: true, timeout: 5000});
    }
}
