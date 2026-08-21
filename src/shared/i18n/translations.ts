export interface SharedTranslations {
  errorPathMissing: string;
  errorPathUnusable: string;
  errorNotRepository: string;
  errorBareRepository: string;
  errorInvalidCloneSource: string;
  errorInvalidCloneDestination: string;
  errorCloneDestinationExists: string;
  errorCloneDestinationCollides: string;
  errorStaleClonePlan: string;
  errorCloneOperationBusy: string;
  errorCloneOperationMissing: string;
  errorCloneVerificationFailed: string;
  errorClonePublishUncertain: string;
  errorCloneCleanupRequired: string;
  errorCloneCleanupUnavailable: string;
  errorCloneFailed: string;
  errorOffline: string;
  errorCertificateFailed: string;
  errorHostKeyFailed: string;
  errorRemoteNotFound: string;
  errorDiskFull: string;
  errorPermissionDenied: string;
  errorPathTooLong: string;
  errorGitMissing: string;
  errorGitUnusable: string;
  errorGitCommandFailed: string;
  errorInvalidIdentity: string;
  errorGitConfigWriteFailed: string;
  errorPathInvalid: string;
  errorPathNotChanged: string;
  errorPathEncodingUnsupported: string;
  errorNothingToSave: string;
  errorUnresolvedConflicts: string;
  errorDetachedHead: string;
  errorGitOperationInProgress: string;
  errorMissingIdentity: string;
  errorEmptyTitle: string;
  errorInvalidTitle: string;
  errorStalePreview: string;
  errorHookRejected: string;
  errorSigningFailed: string;
  errorIndexUnavailable: string;
  errorIndexRestoreFailed: string;
  errorInvalidSelection: string;
  errorNoRemoteConfigured: string;
  errorRemoteSelectionRequired: string;
  errorUnbornBranchNoVersion: string;
  errorNothingToPublish: string;
  errorNothingToGet: string;
  errorBehindRemote: string;
  errorDivergedHistories: string;
  errorStalePublishPlan: string;
  errorStaleGetTeamChangesPlan: string;
  errorInvalidRefName: string;
  errorAuthenticationFailed: string;
  errorNetworkTimeout: string;
  errorOperationCancelled: string;
  errorInvalidRemoteConfiguration: string;
  errorRemoteRefMissing: string;
  errorRemoteRejected: string;
  errorPublishUncertain: string;
  errorGetTeamChangesUncertain: string;
  errorGitVersionTooOld: string;
  errorVersionLineNameTaken: string;
  errorVersionLineNameCollides: string;
  errorVersionLineCheckedOutElsewhere: string;
  errorVersionLineIsActive: string;
  errorVersionLineUniqueWork: string;
  errorVersionLineSwitchObstructed: string;
  errorStaleVersionLinePlan: string;
  errorDirtyWorkingTree: string;
  errorIncomingPathCollision: string;
  errorRefLocked: string;
  errorNothingToDiscard: string;
  errorStaleDiscardPlan: string;
  errorRecoveryUnavailable: string;
  errorRecoveryConflict: string;
  errorRecoveryFailed: string;
  commonSystem: string;
  commonVersion: string;
  commonClose: string;
  commonLoading: string;
  commonCancel: string;
}

const en: SharedTranslations = {
  errorPathMissing: "That folder no longer exists. Choose another folder.",
  errorPathUnusable: "That folder can't be read. Check its permissions or choose another folder.",
  errorNotRepository: "That folder isn't inside a Git project. Choose a project folder and try again.",
  errorBareRepository: "That Git repository has no working files, so GitOdrile can't open it yet.",
  errorInvalidCloneSource: "Enter a complete HTTPS, SSH, Git, file URL, or local Git path.",
  errorInvalidCloneDestination: "Choose a valid parent folder and a safe new project name.",
  errorCloneDestinationExists: "Something already exists at that destination. GitOdrile will not replace it.",
  errorCloneDestinationCollides: "That destination collides with an existing path or private staging name. Choose another name.",
  errorStaleClonePlan: "The source or destination changed after the preview. Review the clone again.",
  errorCloneOperationBusy: "This clone attempt is already running.",
  errorCloneOperationMissing: "That clone attempt is no longer running. Start a new attempt if needed.",
  errorCloneVerificationFailed: "The downloaded data could not be verified as a usable Git project, so it was not published.",
  errorClonePublishUncertain: "The project may be in the destination, but GitOdrile could not verify the final move. Inspect it before retrying.",
  errorCloneCleanupRequired: "The clone stopped, but its marked private staging folder still needs safe cleanup.",
  errorCloneCleanupUnavailable: "GitOdrile cannot prove that it owns this staging path, so it will not remove it.",
  errorCloneFailed: "Git could not clone this project. Check the remote, destination, and technical details.",
  errorOffline: "The remote host could not be reached. Check your connection, VPN, proxy, and host name.",
  errorCertificateFailed: "Git could not verify the server certificate. Check the certificate, proxy, and system trust settings.",
  errorHostKeyFailed: "SSH could not verify the host key. Verify the host with your system SSH tools, then retry.",
  errorRemoteNotFound: "The remote project was not found. Check its location and your access rights.",
  errorDiskFull: "There is not enough disk space to finish cloning. Free space and retry.",
  errorPermissionDenied: "GitOdrile does not have permission to read the source or write the destination.",
  errorPathTooLong: "A project path is too long for this checkout. Choose a shorter destination or adjust long-path support.",
  errorGitMissing: "Git wasn't found. Install Git, reopen GitOdrile, and try again.",
  errorGitUnusable: "Git is installed but couldn't be started. Check the installation and try again.",
  errorGitCommandFailed: "Git couldn't inspect this project. Check that its files are readable.",
  errorInvalidIdentity: "Enter both a name and an email.",
  errorGitConfigWriteFailed: "Git couldn't save that identity. Check your global Git configuration.",
  errorPathInvalid: "That file path isn't valid. Choose the file again from the list.",
  errorPathNotChanged: "This file is no longer part of the unsaved changes. Refresh the list and choose a file that is still listed.",
  errorPathEncodingUnsupported:
    "This project contains a file name GitOdrile can't represent safely. Rename it with a Unicode-compatible name and refresh.",
  errorNothingToSave: "There's nothing to save right now. Make some changes first.",
  errorUnresolvedConflicts: "Some files have overlapping changes that need to be resolved before you can save.",
  errorDetachedHead: "This project isn't on a version line right now. Switch to one before saving a version.",
  errorGitOperationInProgress:
    "A Git operation is already in progress in this project. Finish or abort it, then try again.",
  errorMissingIdentity: "GitOdrile doesn't know who is saving this version yet. Add a name and email in Settings.",
  errorEmptyTitle: "Write a short name before saving.",
  errorInvalidTitle: "Keep the version name on one line.",
  errorStalePreview: "This project changed since the preview was shown. Review the updated changes and try again.",
  errorHookRejected: "A Git hook rejected this version. Check the hook's output, then try again.",
  errorSigningFailed: "Git couldn't sign this version. Check your commit-signing setup (GPG or SSH key) and try again.",
  errorIndexUnavailable:
    "GitOdrile couldn't safely prepare this project's Git index. Check disk space and permissions, then try again.",
  errorIndexRestoreFailed:
    "GitOdrile couldn't restore the project's prepared changes. Your working files are still there; review the technical details before trying again.",
  errorInvalidSelection: "Choose at least one file to save.",
  errorNoRemoteConfigured: "This project has no remote project configured yet. Add a remote in Git, then try again.",
  errorRemoteSelectionRequired: "This project has more than one remote project. Choose which one to publish to.",
  errorUnbornBranchNoVersion: "There's no saved version on this version line yet. Save a version first.",
  errorNothingToPublish: "Every saved version is already published.",
  errorNothingToGet: "This project no longer has newer team versions that can be applied as a direct update.",
  errorBehindRemote: "The remote project has newer versions this project doesn't have yet. Get the team's changes first.",
  errorDivergedHistories:
    "This version line and the remote project have both moved apart. Get the team's changes first.",
  errorStalePublishPlan: "This project or the remote project changed since the preview was shown. Try publishing again.",
  errorStaleGetTeamChangesPlan: "This project or its team destination changed since the preview. Review the updated plan.",
  errorInvalidRefName: "This version line's name isn't a valid Git reference.",
  errorAuthenticationFailed: "GitOdrile couldn't sign in to the remote project. Check your Git credentials and try again.",
  errorNetworkTimeout: "GitOdrile couldn't reach the remote project in time. Check your connection and try again.",
  errorOperationCancelled: "The remote check was cancelled. Try again when you’re ready.",
  errorInvalidRemoteConfiguration: "This version line's remote setup is incomplete or invalid. Repair its upstream configuration in Git.",
  errorRemoteRefMissing: "The configured team version no longer exists on the remote project. Check the upstream setup before trying again.",
  errorRemoteRejected: "The remote project rejected this publish. Check the remote project's rules for this branch.",
  errorPublishUncertain:
    "GitOdrile lost the connection while publishing. Refresh and check whether it was published before trying again.",
  errorGetTeamChangesUncertain:
    "GitOdrile could not prove the final local state. Keep the recovery reference and inspect the project before another action.",
  errorGitVersionTooOld:
    "This version of Git is too old for GitOdrile to change version lines safely. Update Git to version 2.23 or newer.",
  errorVersionLineNameTaken: "A version line with this exact name already exists. Choose a different name.",
  errorVersionLineNameCollides:
    "That name only differs by letter case from an existing version line, which some file systems can't tell apart. Choose a different name.",
  errorVersionLineCheckedOutElsewhere: "That version line is open in another workspace.",
  errorVersionLineIsActive: "The active version line can't be deleted. Switch to a different one first.",
  errorVersionLineUniqueWork:
    "This version line has saved work that isn't reachable from any other version line or remote yet.",
  errorVersionLineSwitchObstructed:
    "Git found local changes in the way of this switch that weren't visible in the preview. Save or discard them in Git directly, then try again.",
  errorStaleVersionLinePlan: "This project changed since the preview was shown. Refresh and try again.",
  errorDirtyWorkingTree:
    "This project has unsaved changes, so GitOdrile can't switch version lines yet. Save a version, or start a new version line with this work.",
  errorIncomingPathCollision:
    "A local untracked or ignored path could be overwritten by the team update. Move or save it yourself, then review again.",
  errorRefLocked: "Git couldn't update its references right now — another Git process may be using them.",
  errorNothingToDiscard: "There are no matching changes to discard. Refresh Changes and try again.",
  errorStaleDiscardPlan: "The changed files moved since the preview was shown. Review the updated plan.",
  errorRecoveryUnavailable: "That discard recovery is no longer available.",
  errorRecoveryConflict: "The project changed after this discard, so GitOdrile won't overwrite the newer work.",
  errorRecoveryFailed: "GitOdrile couldn't create or apply the local recovery safely. Check disk space and permissions.",
  commonSystem: "System",
  commonVersion: "Version",
  commonClose: "Close",
  commonLoading: "Loading…",
  commonCancel: "Cancel",
};

const es: SharedTranslations = {
  errorPathMissing: "Esa carpeta ya no existe. Elige otra carpeta.",
  errorPathUnusable: "No se puede leer esa carpeta. Comprueba sus permisos o elige otra.",
  errorNotRepository: "Esa carpeta no está dentro de un proyecto de Git. Elige una carpeta del proyecto.",
  errorBareRepository: "Ese repositorio no contiene archivos de trabajo, así que GitOdrile aún no puede abrirlo.",
  errorInvalidCloneSource: "Introduce una URL HTTPS, SSH, Git o file completa, o una ruta Git local.",
  errorInvalidCloneDestination: "Elige una carpeta contenedora válida y un nombre nuevo seguro para el proyecto.",
  errorCloneDestinationExists: "Ya existe algo en ese destino. GitOdrile no lo reemplazará.",
  errorCloneDestinationCollides: "Ese destino colisiona con una ruta existente o un nombre temporal privado. Elige otro nombre.",
  errorStaleClonePlan: "El origen o el destino cambiaron después de la vista previa. Revisa de nuevo la clonación.",
  errorCloneOperationBusy: "Este intento de clonación ya está en curso.",
  errorCloneOperationMissing: "Ese intento de clonación ya no está en curso. Inicia uno nuevo si lo necesitas.",
  errorCloneVerificationFailed: "Los datos descargados no se pudieron verificar como proyecto Git utilizable, así que no se publicaron.",
  errorClonePublishUncertain: "Puede que el proyecto esté en el destino, pero GitOdrile no pudo verificar el movimiento final. Inspecciónalo antes de reintentar.",
  errorCloneCleanupRequired: "La clonación se detuvo, pero su carpeta temporal privada marcada todavía requiere una limpieza segura.",
  errorCloneCleanupUnavailable: "GitOdrile no puede demostrar que esa ruta temporal sea suya, así que no la eliminará.",
  errorCloneFailed: "Git no pudo clonar este proyecto. Comprueba el remoto, el destino y los detalles técnicos.",
  errorOffline: "No se pudo contactar con el host remoto. Comprueba la conexión, VPN, proxy y nombre del host.",
  errorCertificateFailed: "Git no pudo verificar el certificado del servidor. Comprueba el certificado, proxy y confianza del sistema.",
  errorHostKeyFailed: "SSH no pudo verificar la clave del host. Verifica el host con las herramientas SSH del sistema y reintenta.",
  errorRemoteNotFound: "No se encontró el proyecto remoto. Comprueba su ubicación y tus permisos de acceso.",
  errorDiskFull: "No hay espacio suficiente para terminar la clonación. Libera espacio y reintenta.",
  errorPermissionDenied: "GitOdrile no tiene permiso para leer el origen o escribir en el destino.",
  errorPathTooLong: "Una ruta del proyecto es demasiado larga. Elige un destino más corto o ajusta el soporte de rutas largas.",
  errorGitMissing: "No se encontró Git. Instálalo, vuelve a abrir GitOdrile e inténtalo de nuevo.",
  errorGitUnusable: "Git está instalado, pero no se pudo iniciar. Comprueba la instalación.",
  errorGitCommandFailed: "Git no pudo inspeccionar este proyecto. Comprueba que sus archivos se puedan leer.",
  errorInvalidIdentity: "Introduce un nombre y un correo electrónico.",
  errorGitConfigWriteFailed: "Git no pudo guardar la identidad. Comprueba tu configuración global de Git.",
  errorPathInvalid: "Esa ruta de archivo no es válida. Elige el archivo de nuevo desde la lista.",
  errorPathNotChanged:
    "Este archivo ya no forma parte de los cambios sin guardar. Actualiza la lista y elige un archivo que siga apareciendo.",
  errorPathEncodingUnsupported:
    "Este proyecto contiene un nombre de archivo que GitOdrile no puede representar de forma segura. Renómbralo con un nombre Unicode compatible y actualiza.",
  errorNothingToSave: "No hay nada que guardar ahora mismo. Haz algún cambio primero.",
  errorUnresolvedConflicts: "Algunos archivos tienen cambios superpuestos que hay que resolver antes de poder guardar.",
  errorDetachedHead: "Este proyecto no está en una línea de versión ahora mismo. Cambia a una antes de guardar una versión.",
  errorGitOperationInProgress:
    "Ya hay una operación de Git en curso en este proyecto. Termínala o cancélala, y vuelve a intentarlo.",
  errorMissingIdentity: "GitOdrile todavía no sabe quién está guardando esta versión. Añade un nombre y un correo en Configuración.",
  errorEmptyTitle: "Escribe un nombre breve antes de guardar.",
  errorInvalidTitle: "Escribe el nombre de la versión en una sola línea.",
  errorStalePreview: "Este proyecto cambió desde que se mostró la vista previa. Revisa los cambios actualizados e inténtalo de nuevo.",
  errorHookRejected: "Un hook de Git rechazó esta versión. Revisa lo que indica el hook e inténtalo de nuevo.",
  errorSigningFailed: "Git no pudo firmar esta versión. Comprueba tu configuración de firma (GPG o clave SSH) e inténtalo de nuevo.",
  errorIndexUnavailable:
    "GitOdrile no pudo preparar de forma segura el índice de Git de este proyecto. Comprueba el espacio en disco y los permisos, e inténtalo de nuevo.",
  errorIndexRestoreFailed:
    "GitOdrile no pudo restaurar los cambios preparados del proyecto. Tus archivos siguen ahí; revisa los detalles técnicos antes de intentarlo de nuevo.",
  errorInvalidSelection: "Elige al menos un archivo para guardar.",
  errorNoRemoteConfigured: "Este proyecto todavía no tiene un proyecto remoto configurado. Añade un remoto en Git e inténtalo de nuevo.",
  errorRemoteSelectionRequired: "Este proyecto tiene más de un proyecto remoto. Elige a cuál publicar.",
  errorUnbornBranchNoVersion: "Todavía no hay ninguna versión guardada en esta línea de versión. Guarda una versión primero.",
  errorNothingToPublish: "Todas las versiones guardadas ya están publicadas.",
  errorNothingToGet: "Este proyecto ya no tiene versiones nuevas del equipo que se puedan aplicar como actualización directa.",
  errorBehindRemote:
    "El proyecto remoto tiene versiones más recientes que este proyecto todavía no tiene. Obtén primero los cambios del equipo.",
  errorDivergedHistories:
    "Esta línea de versión y el proyecto remoto se han separado. Obtén primero los cambios del equipo.",
  errorStalePublishPlan:
    "Este proyecto o el proyecto remoto cambiaron desde que se mostró la vista previa. Intenta publicar de nuevo.",
  errorStaleGetTeamChangesPlan:
    "Este proyecto o su destino del equipo cambiaron desde la vista previa. Revisa el plan actualizado.",
  errorInvalidRefName: "El nombre de esta línea de versión no es una referencia de Git válida.",
  errorAuthenticationFailed:
    "GitOdrile no pudo iniciar sesión en el proyecto remoto. Comprueba tus credenciales de Git e inténtalo de nuevo.",
  errorNetworkTimeout: "GitOdrile no pudo contactar con el proyecto remoto a tiempo. Comprueba tu conexión e inténtalo de nuevo.",
  errorOperationCancelled: "Se canceló la comprobación remota. Inténtalo de nuevo cuando quieras.",
  errorInvalidRemoteConfiguration: "La configuración remota de esta línea de versión está incompleta o no es válida. Repara su upstream en Git.",
  errorRemoteRefMissing: "La versión configurada del equipo ya no existe en el proyecto remoto. Revisa el upstream antes de intentarlo de nuevo.",
  errorRemoteRejected: "El proyecto remoto rechazó esta publicación. Revisa las reglas del proyecto remoto para esta rama.",
  errorPublishUncertain:
    "GitOdrile perdió la conexión mientras publicaba. Actualiza y comprueba si se publicó antes de intentarlo de nuevo.",
  errorGetTeamChangesUncertain:
    "GitOdrile no pudo demostrar el estado local final. Conserva la referencia de recuperación e inspecciona el proyecto antes de realizar otra acción.",
  errorGitVersionTooOld:
    "Esta versión de Git es demasiado antigua para que GitOdrile cambie de línea de versión de forma segura. Actualiza Git a la versión 2.23 o posterior.",
  errorVersionLineNameTaken: "Ya existe una línea de versión con exactamente este nombre. Elige otro nombre.",
  errorVersionLineNameCollides:
    "Ese nombre solo se diferencia por mayúsculas o minúsculas de una línea de versión existente, algo que algunos sistemas de archivos no distinguen. Elige otro nombre.",
  errorVersionLineCheckedOutElsewhere: "Esa línea de versión está abierta en otro espacio de trabajo.",
  errorVersionLineIsActive: "La línea de versión activa no se puede eliminar. Cambia primero a otra distinta.",
  errorVersionLineUniqueWork:
    "Esta línea de versión tiene trabajo guardado que todavía no es accesible desde ninguna otra línea de versión ni remoto.",
  errorVersionLineSwitchObstructed:
    "Git encontró cambios locales que impiden este cambio y que no eran visibles en la vista previa. Guárdalos o descártalos directamente en Git, e inténtalo de nuevo.",
  errorStaleVersionLinePlan: "Este proyecto cambió desde que se mostró la vista previa. Actualiza e inténtalo de nuevo.",
  errorDirtyWorkingTree:
    "Este proyecto tiene cambios sin guardar, así que GitOdrile no puede cambiar de línea de versión todavía. Guarda una versión, o inicia una nueva línea de versión con este trabajo.",
  errorIncomingPathCollision:
    "Una ruta local sin seguimiento o ignorada podría sobrescribirse con la actualización del equipo. Muévela o guárdala tú y vuelve a revisar.",
  errorRefLocked: "Git no pudo actualizar sus referencias ahora mismo (otro proceso de Git podría estar usándolas).",
  errorNothingToDiscard: "No hay cambios coincidentes que descartar. Actualiza Cambios e inténtalo de nuevo.",
  errorStaleDiscardPlan: "Los archivos cambiaron desde que se mostró la vista previa. Revisa el plan actualizado.",
  errorRecoveryUnavailable: "Esa recuperación de descarte ya no está disponible.",
  errorRecoveryConflict: "El proyecto cambió después del descarte, así que GitOdrile no sobrescribirá el trabajo nuevo.",
  errorRecoveryFailed: "GitOdrile no pudo crear o aplicar la recuperación local de forma segura. Comprueba el espacio y los permisos.",
  commonSystem: "Sistema",
  commonVersion: "Versión",
  commonClose: "Cerrar",
  commonLoading: "Cargando…",
  commonCancel: "Cancelar",
};

export const sharedTranslations = { en, es } as const;
