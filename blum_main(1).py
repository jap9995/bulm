# Made with ❤ by @adearman
# Join tele channel for update t.me/ghalibie
import argparse
import asyncio
import configparser
import json
import random
import string
import sys
import traceback
from loguru import logger
import httpx
import datetime

from requests.structures import CaseInsensitiveDict
from tenacity import retry, wait_fixed, stop_after_attempt

asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

g_success, g_fail = 0, 0
logger.remove()
logger.add(sys.stdout, colorize=True,
           format="<w>{time:HH:mm:ss:SSS}</w> | <r>{extra[fail]}</r>-<g>{extra[success]}</g> | <level>{message}</level>")
logger = logger.patch(lambda record: record["extra"].update(fail=g_fail, success=g_success))
start_time = datetime.datetime.now()  # Tentukan waktu mulai saat bot dijalankan
formatted_time = start_time.strftime('%Y-%m-%d')




class blum_bot:

    def __init__(self, query_token, _nstproxy_Channel=None, _nstproxy_Password=None, index=None, user_token=None):

        self.query_token = query_token
        self.user_token = user_token
        self.index = index
        self.nstproxy_channel = _nstproxy_Channel
        self.nstproxy_password = _nstproxy_Password
        session = ''.join(random.choice(string.digits + string.ascii_letters) for _ in range(10))
        nstproxy = f"http://{self.nstproxy_channel}-residential-country_ANY-r_5m-s_{session}:{self.nstproxy_password}@gw-us.nstproxy.com:24125"
        proxies = {'all://': nstproxy}
        self.client = httpx.AsyncClient(verify=False, timeout=120, proxies=proxies)

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def get_new_token(self):
        try:
            logger.info(f"准备开始获取电报Token")
            headers = {
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-US,en;q=0.9",
                "content-type": "application/json",
                "origin": "https://telegram.blum.codes",
                "priority": "u=1, i",
                "referer": "https://telegram.blum.codes/"
            }
            payload = {"query": self.query_token}
            url = "https://gateway.blum.codes/v1/auth/provider/PROVIDER_TELEGRAM_MINI_APP"
            response = await self.client.post(url, headers=headers, json=payload)

            if response.status_code == 200:
                response_json = response.json()
                logger.debug(f"获取用户refresh_toekn: {response_json}")
                self.user_token = response_json['token']['refresh']
                return True
            else:
                logger.error('获取令牌失败！')
                return False
        except Exception as e:
            traceback.print_exc()
            logger.error(f"获取令牌失败： {e}")
            raise





    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def get_user_balance(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://telegram.blum.codes',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.get('https://game-domain.blum.codes/api/v1/user/balance', headers=headers)
            if response.status_code == 200:
                logger.debug(f"获取用户余额成功:{response.json()}")
                return response.json()
            else:
                raise Exception('请求获取用户余额失败')
        except Exception as e:
            logger.error(f"获取用户余额报错： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def get_user_info(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://telegram.blum.codes',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.get('https://gateway.blum.codes/v1/user/me', headers=headers)
            if response.status_code == 200:
                logger.info(f"获取用户信息: {response.json()}")
                usr_name = response.json()['username']
                resp = await self.get_user_balance()
                if resp:
                    balance = resp['availableBalance']
                    # start_time = resp['farming']['startTime']
                    # end_time = resp['farming']['endTime']
                    logger.success(
                        f"用户: {usr_name} | 余额: {balance}")
                    return f"用户: {usr_name} ---- 余额: {balance}"
                else:
                    logger.error(f"获取用户余额失败")
                    return None
            else:
                result = response.json()
                if result['message'] == 'Token is invalid':
                    logger.error('获取用户余额失败，token不正确,重新获取token')
                    new_token = await self.get_new_token()
                    if new_token:
                        print(f"第{self.index}行 数据更新token成功")
                        result = await self.get_user_info(new_token)  # Rekursif memanggil fungsi dengan token baru
                        return result
                    else:
                        return None
                else:
                    logger.error(f"获取用户余额失败")
                return None
        except Exception as e:
            traceback.print_exc()
            logger.error(f"获取用户余额失败： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def claim_balance(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.post('https://game-domain.blum.codes/api/v1/farming/claim', headers=headers)
            logger.debug(f"claim余额post: {response.json()}")
            if response.status_code == 200:
                logger.success(f"cliam用户余额成功")
                return response.json()
            else:
                raise Exception('claim用户余额失败')
        except Exception as e:
            logger.error(f"claim用户余额报错： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def check_tasks(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24", "Microsoft Edge WebView2";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.get('https://game-domain.blum.codes/api/v1/tasks', headers=headers)
            if response.status_code == 200:
                tasks = response.json()
                # logger.debug(f"获取任务列表: {tasks}")
                for task_data in tasks:
                    task = task_data['tasks'][0]
                    logger.debug(f"获取任务列表: {task}")
                    titlenya = task['title']
                    if task['status'] == 'CLAIMED':
                        logger.success(
                            f"任务 {titlenya} ： 已经领取  | Status: {task['status']} | Reward: {task['reward']}")
                    elif task['status'] == 'NOT_STARTED':
                        logger.info(f"开始任务: {task['title']}")
                        try:
                            res = await self.start_task(task['id'], titlenya)
                            if res:
                                await self.claim_task(task['id'], titlenya)
                        except Exception:
                            raise Exception(f"执行任务: {task['title']} 失败")
                    else:
                        logger.info(f" 任务已经开始: {task['title']} | 状态: {task['status']} | 奖励: {task['reward']}")
            else:
                raise Exception(f"获取任务失败： {response.json()}")
        except Exception as e:
            traceback.print_exc()
            logger.error(f"获取任务失败 : {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def start_task(self, task_id, titlenya):
        url = f'https://game-domain.blum.codes/api/v1/tasks/{task_id}/start'
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24", "Microsoft Edge WebView2";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.post(url, headers=headers)
            if response.status_code == 200:
                logger.info(f"任务 {titlenya} 开始")
                return True
            else:
                logger.info(f"启动任务{titlenya}失败：{response.json()} ")
                return False
        except Exception as e:
            logger.error(f"启动任务失败： {titlenya}: {e}")
            raise
        finally:
            await asyncio.sleep(3)

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def claim_task(self, task_id, titlenya):
        logger.info(f"开始领取任务奖励： {titlenya}")
        url = f'https://game-domain.blum.codes/api/v1/tasks/{task_id}/claim'
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24", "Microsoft Edge WebView2";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.post(url, headers=headers)
            if response.status_code == 200:
                logger.info(f"任务 {titlenya}: claimed成功")
            else:
                logger.error(f"任务claim task 任务失败 {titlenya}")
        except Exception as e:
            logger.error(f"Failed to claim task {titlenya}:{e} ")

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def start_farming(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.post('https://game-domain.blum.codes/api/v1/farming/start', headers=headers)
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception('任务Farming启动失败')
        except Exception as e:
            logger.error(f"任务Farming异常： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def check_daily_reward(self):
        header = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://telegram.blum.codes',
            'content-length': '0',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
            'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24", "Microsoft Edge WebView2";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site'
        }
        try:
            response = await self.client.post('https://game-domain.blum.codes/api/v1/daily-reward?offset=-420',
                                              headers=header, timeout=10)
            if response.status_code == 400:
                try:
                    return response.json()
                except json.JSONDecodeError:
                    if response.text == "OK":
                        return response.text
                    return None
            else:
                try:
                    return response.json()
                except json.JSONDecodeError:
                    logger.info(f"Json Error: {response.text}")
                    return None
        except Exception as e:
            raise Exception(f"claim daily失败: {e}")

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def check_balance_friend(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://telegram.blum.codes',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24", "Microsoft Edge WebView2";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.get('https://gateway.blum.codes/v1/friends/balance', headers=headers)
            logger.debug(f"获取邀请奖励post: {response.json()}")
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception('请求获取邀请奖励失败')
        except Exception as e:
            logger.error(f"获取邀请奖励异常： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def claim_balance_friend(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'content-length': '0',
            'origin': 'https://telegram.blum.codes',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Microsoft Edge";v="125", "Chromium";v="125", "Not.A/Brand";v="24", "Microsoft Edge WebView2";v="125"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.post('https://gateway.blum.codes/v1/friends/claim', headers=headers)
            if response.status_code == 200:
                return response.json()
            else:
                raise Exception('claim 邀请奖励失败')
        except Exception as e:
            logger.error(f"获取邀请奖励异常： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def play_game(self):
        headers = {
            'Authorization': f'Bearer {self.user_token}',
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'en-US,en;q=0.9',
            'origin': 'https://telegram.blum.codes',
            'content-length': '0',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        }
        try:
            response = await self.client.post('https://game-domain.blum.codes/api/v1/game/play', headers=headers)
            logger.debug(f"play游戏任务post: {response.json()}")
            return response.json()
        except Exception as e:
            logger.error(f"玩游戏任务失败： {e}")
            raise

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(3))
    async def claim_game(self, game_id, points):
        logger.debug(f"开始领取游戏奖励： {game_id}")
        # headers = {
        #     'Authorization': f'Bearer {self.user_token}',
        #     'accept': 'application/json, text/plain, */*',
        #     "content-type": "application/json",
        #     'accept-language': 'en-US,en;q=0.9',
        #     'origin': 'https://telegram.blum.codes',
        #     "priority": "u=1, i",
        #     'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
        # }
        url = "https://game-domain.blum.codes/api/v1/game/claim"
        headers = CaseInsensitiveDict()
        headers["accept"] = "application/json, text/plain, */*"
        headers["accept-language"] = "en-US,en;q=0.9"
        headers["authorization"] = "Bearer " + self.user_token
        headers["content-type"] = "application/json"
        headers["origin"] = "https://telegram.blum.codes"
        headers["priority"] = "u=1, i"
        headers[
            "user-agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0"
        data = '{"gameId":"' + game_id + '","points":' + str(points) + '}'
        # data = {'gameId': game_id, 'points': points}
        try:
            response = await self.client.post(url, headers=headers, data=data)
            logger.debug(f"claim游戏任务post: {response.text}")
            return response
        except Exception as e:
            traceback.print_exc()
            logger.error(f"claim游戏任务失败： {e}")
            raise


async def async_login(thread_count):
    semaphore = asyncio.Semaphore(thread_count)
    with open('telegram_data.txt', 'r') as tel_file:
        task = [do_login(semaphore, index, account_line.strip()) for index, account_line in
                enumerate(tel_file.readlines())]
    await asyncio.gather(*task)


async def do_login(semaphore, index, query_token):
    global g_success, g_fail
    with open(f'blum_登录成功.txt', 'a') as succ_file, open(f'blum_登录失败.txt', 'a') as fail_file:
        async with semaphore:
            logger.info(f"开始登录第{index}行数据")
            blum = blum_bot(query_token, _nstproxy_Channel, _nstproxy_Password, index)
            try:
                res = await blum.get_new_token()
                if res:
                    succ_file.write(f'{blum.query_token}----{blum.user_token}\n')
                    g_success += 1
                    logger.success(f'第{index}行数据登录成功: {blum.user_token}')
                else:
                    fail_file.write(f'{query_token}\n')
                    g_fail += 1
                    logger.error(f'第{index}数据 : 登录失败')
            except Exception as e:
                fail_file.write(f'{query_token}\n')
                logger.error(f'获取电报Token失败: {e}')
                return
            finally:
                succ_file.flush()
                fail_file.flush()
                await asyncio.sleep(random.randint(3, 5))


async def async_userInfo(thread_count):
    semaphore = asyncio.Semaphore(thread_count)
    with open('blum_登录成功.txt', 'r') as tel_file:
        task = [do_userInfo(semaphore, index, account_line.strip()) for index, account_line in
                enumerate(tel_file.readlines())]
    await asyncio.gather(*task)


async def do_userInfo(semaphore, index, line_data):
    global g_success, g_fail
    with open(f'blum_userInfo_失败.txt', 'w') as fail_file, open(f'blum_userInfo_成功.txt', 'w') as succ_file:
        async with semaphore:
            query_token = line_data.split('----')[0]
            user_token = line_data.split('----')[1]
            logger.info(f"开始获取第{index}行用户数据")
            blum = blum_bot(query_token, _nstproxy_Channel, _nstproxy_Password, index, user_token)
            try:
                res = await blum.get_user_info()
                if res:
                    succ_file.write(res)
                    g_success += 1
                else:
                    fail_file.write(f'{user_token}\n')
                    g_fail += 1
                    logger.error(f'第{index}数据 : 获取失败')
            except Exception as e:
                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                logger.error(f'获取用户信息失败: {e}')
                return
            finally:
                succ_file.flush()
                fail_file.flush()
                await asyncio.sleep(random.randint(3, 5))


async def do_claimtask(semaphore, index, line_data):
    global g_success, g_fail
    with open(f'blum_claimTask_失败.txt', 'w') as fail_file:
        async with semaphore:
            query_token = line_data.split('----')[0]
            user_token = line_data.split('----')[1]
            logger.info(f"开始获取第{index}行用户数据")
            blum = blum_bot(query_token, _nstproxy_Channel, _nstproxy_Password, index, user_token)
            try:
                await blum.check_tasks()
                g_success += 1
            except Exception as e:
                traceback.print_exc()
                g_fail += 1
                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                logger.error(f'获取用户信息失败: {e}')
                return
            finally:
                fail_file.flush()
                await asyncio.sleep(random.randint(3, 5))


async def async_claimtask(thread_count):
    semaphore = asyncio.Semaphore(thread_count)
    with open('blum_登录成功.txt', 'r') as tel_file:
        task = [do_claimtask(semaphore, index, account_line.strip()) for index, account_line in
                enumerate(tel_file.readlines())]
    await asyncio.gather(*task)


async def do_refftask(semaphore, index, line_data):
    global g_success, g_fail
    with open(f'blum_邀请奖励_失败.txt', 'w') as fail_file:
        async with semaphore:
            query_token = line_data.split('----')[0]
            user_token = line_data.split('----')[1]
            logger.info(f"开始获取第{index}行用户数据")
            blum = blum_bot(query_token, _nstproxy_Channel, _nstproxy_Password, index, user_token)
            try:
                friend_balance = await blum.check_balance_friend()
                if friend_balance:
                    if friend_balance['canClaim']:
                        logger.info(f"开始领取邀请奖励余额: {friend_balance['amountForClaim']}")
                        claim_friend_result = await blum.claim_balance_friend()
                        if claim_friend_result:
                            claimed_amount = claim_friend_result['claimBalance']
                            logger.success(f"[ Reff Balance ] : 成功领取邀请奖励: {claimed_amount}")
                            g_success += 1
                        else:
                            g_fail += 1
                            logger.error(f"[ Reff Balance ] : 领取邀请奖励 失败")
                else:
                    g_fail += 1
                    logger.error(f'无法获取推荐余额')
            except Exception as e:
                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                logger.error(f'领取邀请奖励失败: {e}')
                return
            finally:
                fail_file.flush()
                await asyncio.sleep(random.randint(3, 5))


async def async_refftask(thread_count):
    semaphore = asyncio.Semaphore(thread_count)
    with open('blum_登录成功.txt', 'r') as tel_file:
        task = [do_refftask(semaphore, index, account_line.strip()) for index, account_line in
                enumerate(tel_file.readlines())]
    await asyncio.gather(*task)


async def do_dailytask(semaphore, index, line_data):
    global g_success, g_fail
    with open(f'blum_dailyTask_失败.txt', 'w') as fail_file:
        async with semaphore:
            query_token = line_data.split('----')[0]
            user_token = line_data.split('----')[1]
            logger.info(f"开始获取第{index}行用户数据")
            blum = blum_bot(query_token, _nstproxy_Channel, _nstproxy_Password, index, user_token)

            try:
                daily_reward_result = await blum.check_daily_reward()
                if daily_reward_result is None:
                    logger.error(f"[ 每日奖励 ] : 无法检查每日奖励")
                    g_fail += 1
                    return
                if daily_reward_result.get('message') == 'same day':
                    logger.success(f"[ 每日奖励 ] : 今天的每日奖励已经领取过了", flush=True)
                    g_success += 1
                elif daily_reward_result.get('message') == 'OK':
                    logger.success(f"[ 每日奖励 ] : 每日奖励领取成功！", flush=True)
                    g_success += 1
                else:
                    logger.error(f"[ 每日奖励 ] : 无法检查每日奖励。 {daily_reward_result}")
                    g_fail += 1
            except Exception as e:
                traceback.print_exc()
                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                logger.error(f'执行日常任务: {e}')
                return

            fail_file.flush()
            # 进行每日Farming任务
            try:
                logger.info('进行Farming 任务')
                balance_info = await blum.get_user_balance()
                logger.debug(f"请求余额返回信息: {balance_info}")
                available_balance_before = balance_info['availableBalance']
                balance_before = f"{float(available_balance_before):,.0f}"
                logger.info(f"blum [余额]: {balance_before}")
                # 获取到Farming信息，进行判断
                farming_info = balance_info.get('farming')

                if farming_info:
                    end_time_ms = farming_info['endTime']
                    end_time_s = end_time_ms / 1000.0
                    end_utc_date_time = datetime.datetime.fromtimestamp(end_time_s, datetime.timezone.utc)
                    current_utc_time = datetime.datetime.now(datetime.timezone.utc)
                    time_difference = end_utc_date_time - current_utc_time
                    hours_remaining = int(time_difference.total_seconds() // 3600)
                    minutes_remaining = int((time_difference.total_seconds() % 3600) // 60)
                    farming_balance = farming_info['balance']
                    farming_balance_formated = f"{float(farming_balance):,.0f}"
                    logger.info(
                        f"[ 认领余额倒计时 ] : {hours_remaining} 小时 {minutes_remaining} 分钟 | 余额: {farming_balance_formated}")
                    if hours_remaining < 0:
                        logger.info(f"[ Farming ] : 开始Farming任务")
                        claim_response = await blum.claim_balance()
                        if claim_response:
                            logger.success(f"[ claim余额 ] : 已认领: {claim_response['availableBalance']}")
                            logger.info(f"[ claim余额 ] : 开始Farming...")
                            start_response = await blum.start_farming()
                            if start_response:
                                logger.success(f"[ Claim Balance ] : Farming 启动成功.")
                                g_success += 1
                            else:
                                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                                logger.error(f"[ Claim Balance ] :  Farming 启动失败.")
                                g_fail += 1
                else:
                    logger.error('[ claim余额 ] : 无法获取Farming信息')
                    start_response = await blum.start_farming()
                    if start_response:
                        logger.success(f"[ Claim Balance ] : Farming 启动成功.")
                        g_success += 1
                    else:
                        fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                        logger.error(f"[ Claim Balance ] :  Farming 启动失败.")
                        g_fail += 1

                    # logger.info('[ claim余额 ] : 开始尝试claim余额...')
                    # claim_response = await blum.claim_balance()
                    # if claim_response:
                    #     logger.success(f"[ claim余额 ] : 已认领: {claim_response['availableBalance']}")
                    #     logger.info(f"[ claim余额 ] : 开始尝试Farming...")
                    #     start_response = await blum.start_farming()
                    #     if start_response:
                    #         logger.success(f"[ Claim Balance ] : Farming 启动成功.")
                    #         g_success += 1
                    #     else:
                    #         logger.error(f"[ Claim Balance ] :  Farming 启动失败.")
                    #         g_fail += 1
            except Exception as e:
                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                logger.error(f'执行Farming任务失败: {e}')
                return
            finally:
                fail_file.flush()
                await asyncio.sleep(random.randint(3, 5))


async def async_dailytask(thread_count):
    semaphore = asyncio.Semaphore(thread_count)
    with open('blum_登录成功.txt', 'r') as tel_file:
        task = [do_dailytask(semaphore, index, account_line.strip()) for index, account_line in
                enumerate(tel_file.readlines())]
    await asyncio.gather(*task)


async def do_playgame(semaphore, index, line_data):
    global g_success, g_fail
    with open(f'blum_playgame_失败.txt', 'w') as fail_file:
        async with semaphore:
            query_token = line_data.split('----')[0]
            user_token = line_data.split('----')[1]
            logger.info(f"开始获取第{index}行用户数据")
            blum = blum_bot(query_token, _nstproxy_Channel, _nstproxy_Password, index, user_token)
            try:
                balance_info = await blum.get_user_balance()

                while balance_info['playPasses'] > 0:
                    logger.info(f"[ Play Game ] : 可用门票数量{balance_info['playPasses']}", flush=True)
                    logger.info(f"[ Play Game ] : 开始 游戏...")

                    game_response = await blum.play_game()

                    logger.info(f"[ Play Game ] : 检查游戏...")
                    await asyncio.sleep(10)
                    claim_response = await blum.claim_game(game_response['gameId'], random.randint(1500, 2000))
                    available_balance_before = balance_info['availableBalance']

                    if claim_response is None:
                        logger.error(f"[ 游戏 ] : 游戏认领失败，正在尝试再次开始...")
                    while True:
                        if claim_response.text == "OK":
                            logger.info(f"[ 游戏 ] : 游戏认领成功")
                            g_success += 1
                            break
                        elif claim_response.json().get('message') == "game session not finished":
                            await asyncio.sleep(10)  # 等待一会再尝试
                            logger.info(f"[ 游戏 ] : 游戏未完成.. 正在尝试再次开始")
                            claim_response = await blum.claim_game(game_response['gameId'], random.randint(1500, 2000))
                            if claim_response is None:
                                logger.error(f"[ 游戏 ] : 游戏认领失败，正在尝试再次开始...")
                        elif claim_response.json().get('message') == "game session not found":
                            logger.info(f"[ 游戏 ] : 游戏已结束")
                            break
                        elif 'message' in claim_response and claim_response.json().get('message') == 'Token is invalid':
                            print(f"[ 游戏 ] : 令牌无效，获取新的令牌...")
                            token = await blum.get_new_token()  # 假设query_id在此范围内可用
                            continue
                        else:
                            logger.info(f"[ 游戏 ] : 游戏结束: {claim_response}")
                            # break
                    balance_info = await blum.get_user_balance()
                    if balance_info is None:  # 刷新余额信息以获取最新的门票
                        print(f"[ 游戏 ] 无法获取门票信息", flush=True)
                    else:
                        available_balance_after = balance_info['availableBalance']  # 假设从JSON中获取此值
                        balance_before = f"{float(available_balance_before)}"
                        logger.info(f"blum [余额]: {balance_before}", flush=True)
                        before = float(available_balance_before)
                        after = float(available_balance_after)
                        total_balance = after - before  # 假设从JSON中获取此值
                        logger.success(f"[ 游戏 ]: 您从游戏中获得了总共 {total_balance} 分")
                        if balance_info['playPasses'] > 0:
                            logger.info(f"[ 游戏 ] : 仍有门票可用，继续玩游戏...", flush=True)
                            continue  # 继续循环以玩游戏
                        else:
                            logger.info(f"[ 游戏 ] : 没有剩余门票.", flush=True)
                            break
            except Exception as e:
                traceback.print_exc()
                g_fail += 1
                fail_file.write(f'{blum.query_token}---{blum.user_token}\n')
                logger.error(f'获取用户信息失败: {e}')
                return
            finally:
                fail_file.flush()
                await asyncio.sleep(random.randint(3, 5))
    pass


async def async_playgame(thread_count):
    semaphore = asyncio.Semaphore(thread_count)
    with open('blum_登录成功.txt', 'r') as tel_file:
        task = [do_playgame(semaphore, index, account_line.strip()) for index, account_line in
                enumerate(tel_file.readlines())]
    await asyncio.gather(*task)


if __name__ == '__main__':

    parser = argparse.ArgumentParser(description='BLUM 任务.')
    parser.add_argument('--user-login', action='store_true', help='开始登录')
    parser.add_argument('--user-info', action='store_true', help='查询用户信息')
    parser.add_argument('--claim-tasks', action='store_true', help='Claim tasks')
    parser.add_argument('--reff-tasks', action='store_true', help='Claim tasks')
    parser.add_argument('--daily-task', action='store_true', help='Claim tasks')
    parser.add_argument('--play-game', action='store_true', help='Claim tasks')
    args = parser.parse_args()

    config = configparser.ConfigParser()
    config.read('config.ini', encoding='utf-8')
    default_config = config['default']
    _nstproxy_Channel = config.get('default', 'nstproxy_channel')
    _nstproxy_Password = config.get('default', 'nstproxy_password')
    thread_count = int(config.get('default', 'th'))

    print(f"当前线程数: {thread_count}")
    print(f"当前代理: {_nstproxy_Channel}, {_nstproxy_Password}")

    print('菜单（请输入对应数字，并按回车键开始任务）')
    print('1、登录')
    print('2、查询用户信息-余额')
    print('3、blum 任务')
    print('4、claim 邀请奖励')
    print('5、每日任务-每日Farming')
    print('6、blum_游戏')
    choice = int(input("请输入选项（1-8）: "))

    if choice == 1 or args.user_login:
        asyncio.run(async_login(thread_count))
    if choice == 2 or args.user_info:
        asyncio.run(async_userInfo(thread_count))
    if choice == 3 or args.claim_tasks:
        asyncio.run(async_claimtask(thread_count))
    if choice == 4 or args.reff_tasks:
        asyncio.run(async_refftask(thread_count))
    if choice == 5 or args.daily_task:
        asyncio.run(async_dailytask(thread_count))
    if choice == 6 or args.play_game:
        asyncio.run(async_playgame(thread_count))
    # asyncio.run(main(thread_count, cek_task_enable, claim_ref_enable))
