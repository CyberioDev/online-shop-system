import { ApiError } from '@/api';

/** User-facing Mongolian message for an API failure. */
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'invalid_credentials':
        return 'Утасны дугаар эсвэл нууц үг буруу байна.';
      case 'unauthorized':
        return 'Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү.';
      case 'timeout':
        return 'Сервер хариу өгөхгүй байна. Дахин оролдоно уу.';
      case 'conflict':
        return error.message !== 'conflict'
          ? error.message
          : 'Мэдээлэл өөрчлөгдсөн байна. Дахин ачаалаад шалгана уу.';
      case 'code_taken':
        return 'Энэ код өөр бараанд ашиглагдсан байна.';
      case 'not_found':
        return 'Мэдээлэл олдсонгүй.';
      case 'network':
        return 'Сервертэй холбогдож чадсангүй. Интернэтээ шалгана уу.';
      case 'validation':
        return error.message !== 'validation' ? error.message : 'Мэдээллээ шалгана уу.';
    }
  }
  return 'Алдаа гарлаа. Дахин оролдоно уу.';
}
