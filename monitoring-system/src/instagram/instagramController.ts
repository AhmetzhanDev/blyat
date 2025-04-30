
import { Request, Response } from 'express';
import dotenv from "dotenv"
import { InstagramService } from './instagramService';
dotenv.config()

const instagramService = new InstagramService()

export class InstagramController {
    public redirectToInstagramAuth(req: Request, res: Response) {
        const instagramAuthUrl = `https://api.instagram.com/oauth/authorize?client_id=${process.env.IG_CLIENT_ID}&redirect_uri=${process.env.IG_REDIRECT_URI}&scope=business_basic,business_manage_messages&response_type=code`;

        res.send({ url: instagramAuthUrl });
        return { url: instagramAuthUrl };
    }


    public async handleAuthCallback(req: Request, res: Response) {
        const {code} = req.params
        console.log("code", code);
        if (!code) {
        throw new Error('Authorization code is missing');
        }
        // Обмен на access_token и сохранение данных пользователя
        const result = await instagramService.exchangeCodeForToken(code);

        res.send(result);
        return result;
    }

    public async handleMessageWebhook(req: Request, res: Response) {
        // Обрабатываем полученные сообщения
        await instagramService.handleMessage(req.body);

        // res.sendStatus(200).send('Webhook received');
        return 'Webhook received';
      }

    public handleVerifyWebhook(
        req: Request, res: Response,
        // @Query('hub.mode') mode: string,
        // @Query('hub.challenge') challenge: string,
        // @Query('hub.verify_token') verifyToken: string,
      ) {
        const mode = req.query["hub.mode"]
        const challenge = req.query["hub.challenge"]
        const verifyToken = req.query["hub.verify_token"]

        console.log("GOT ",verifyToken);
        console.log("Ned ",process.env.IG_VERIFY_TOKEN);
        console.log(challenge, verifyToken === process.env.IG_VERIFY_TOKEN)
        if (verifyToken === process.env.IG_VERIFY_TOKEN) {
          res.send(challenge);
          return challenge; // Возвращаем challenge для подтверждения
        }
        return 'Invalid verification token';
      }
}