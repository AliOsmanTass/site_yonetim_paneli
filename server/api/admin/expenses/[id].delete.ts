import { deleteExpense } from '../../../utils/expenses'

export default defineEventHandler(async (event) => {
  await requireAdminWriteAccess(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Geçersiz harcama id.' })
  }

  await deleteExpense(useDrizzle(), id)
  return { success: true }
})
