import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Request } from 'express';

@Injectable()
export class CognitoAuthGuard implements CanActivate {
  private readonly jwtVerifier;

  constructor() {
    // Configura el verificador JWT para la user pool de Cognito
    this.jwtVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID, // ID de tu User Pool
      tokenUse: 'access', // Puedes cambiar a 'access' dependiendo del token que uses
      clientId: process.env.COGNITO_CLIENT_ID, // ID de la aplicación en Cognito
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request: Request = context.switchToHttp().getRequest();

    // Excluir el GET / del guard
    if (request.method === 'GET' && request.path === '/') {
      return true; // Permitir el acceso sin autenticación
    }

    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No se proporcionó un token válido.');
    }

    const token = authHeader.split(' ')[1];

    try {
      // Verificar el token
      const payload = await this.jwtVerifier.verify(token);

      // Almacenar el payload verificado en el request para usarlo más adelante
      request['user'] = payload;

      return true;
    } catch (error) {
      console.error('Error al verificar el token de Cognito:', error);
      throw new UnauthorizedException('Token inválido o expirado.');
    }
  }
}
